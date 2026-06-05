import { supabase } from './supabase.js'; 

// Default map center point (Balagtas, Bulacan region)
const DEFAULT_COORDS = [14.8309, 120.9086]; 
let map;
let markersLayer;
let locationCircle = null; // Track circle layer globally to easily clear and reset it
let userLocation = null;
let allPetsData = [];
let currentUserId = null; // Tracks the logged-in user ID globally
let userPreferences = { species: null, gender: null }; // Stores profile-based filter preferences

// DOM Bindings
const modal = document.getElementById('pet-modal');
const closeModalBtn = document.querySelector('.close-modal-btn');
const geoBtn = document.getElementById('btn-geolocation');
const locationDisplay = document.getElementById('user-location-display');
const petGrid = document.getElementById('pet-list-grid');
const featuredGrid = document.getElementById('featured-pets-grid'); 
const radiusSelect = document.getElementById('radius-select'); 

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch active session user ID to check profile ownership
        const { data: { session } } = await supabase.auth.getSession();
        currentUserId = session?.user?.id || null;

        // Load preferred_species and preferred_gender from profile (if logged in)
        if (currentUserId) {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('preferred_species, preferred_gender')
                .eq('id', currentUserId)
                .maybeSingle();

            if (error) throw error; // Safely catch structural column typos or RLS issues

            if (profile) {
                // Trim whitespaces to avoid string comparison issues
                userPreferences.species = profile.preferred_species?.trim() || null;
                userPreferences.gender  = profile.preferred_gender?.trim() || null;
            }
        }
    } catch (profileError) {
        console.error("Error pulling profile preferences configuration setup:", profileError.message);
        // Fallback gracefully so the application map elements can still structural load
    }

    // Initialize Map View
    map = L.map('map').setView(DEFAULT_COORDS, 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    // Load pet entries from Supabase
    await fetchPets();

    // Event Handlers
    closeModalBtn.addEventListener('click', toggleModal);
    geoBtn.addEventListener('click', handleGeolocation);
    
    // Listen for radius adjustments to dynamically redraw map metrics and lists
    radiusSelect.addEventListener('change', async () => {
        await renderPetsAndCards();
        updateMapCircle();
    });
});

// Replicated layout string helper formulas from favorites view
function formatAge(months) {
    if (months >= 12) {
        const yrs = Math.floor(months / 12);
        return yrs + (yrs === 1 ? ' year' : ' years');
    }
    return (months || 0) + ' months';
}

// Pull row data directly from your verified table definition layout
async function fetchPets() {
    try {
        const { data, error } = await supabase
            .from('pets') 
            .select('*')
            .eq('adoption_status', 'available');

        if (error) throw error;

        // Filter by profile preferences — case-insensitive match to avoid data mismatches
        let filtered = data || [];
        if (userPreferences.species) {
            filtered = filtered.filter(pet => 
                pet.species && pet.species.toLowerCase() === userPreferences.species.toLowerCase()
            );
        }
        if (userPreferences.gender) {
            filtered = filtered.filter(pet => 
                pet.gender && pet.gender.toLowerCase() === userPreferences.gender.toLowerCase()
            );
        }
        
        allPetsData = filtered;
        
        // Render both views
        await renderPetsAndCards();
        await renderFeaturedPets();
    } catch (err) {
        console.error("Error pulling map data:", err.message);
        petGrid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#e53e3e;">Failed to load pets map metrics.</p>`;
        featuredGrid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#e53e3e;">Failed to load featured pets.</p>`;
    }
}

// Distance calculation formula
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth Radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
              
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

// Helper to refresh the visual circle boundary overlay on the map canvas
function updateMapCircle() {
    if (!userLocation) return;

    // Erase old boundary ring before adding a new one
    if (locationCircle) {
        map.removeLayer(locationCircle);
    }

    const radiusKm = parseInt(radiusSelect.value);
    const radiusMeters = radiusKm * 1000; // Leaflet requires meters for circle radius calculations

    locationCircle = L.circle(userLocation, {
        color: '#ef4444',
        fillColor: '#f87171',
        fillOpacity: 0.12,
        radius: radiusMeters
    }).addTo(map);

    // Smooth zoom transition containing the entire selected scope radius circle
    map.fitBounds(locationCircle.getBounds(), { padding: [20, 20] });
}

// Renders Nearby Pets (Filters dynamically based on the dropdown kilometer choice)
async function renderPetsAndCards() {
    markersLayer.clearLayers();
    petGrid.innerHTML = '';

    if (!userLocation) {
        petGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: var(--gray-color);">
                <i class="fas fa-search-location" style="font-size: 40px; color: var(--primary-color); margin-bottom: 15px;"></i>
                <h3>Please share your location</h3>
                <p>Click the <strong>"Use My Location"</strong> button above to discover pets listed near your area.</p>
            </div>
        `;
        return; 
    }

    if (allPetsData.length === 0) {
        petGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--gray-color);">No posted pets found.</div>`;
        return;
    }

    // Process distances
    let processedList = allPetsData.map(pet => {
        if (pet.latitude && pet.longitude) {
            const dist = calculateHaversineDistance(
                userLocation.lat, userLocation.lng,
                parseFloat(pet.latitude), parseFloat(pet.longitude)
            );
            return { ...pet, distance: dist };
        }
        return { ...pet, distance: null };
    });

    // Read selected limit value and run array filtering rules
    const selectedMaxRadius = parseInt(radiusSelect.value);
    processedList = processedList.filter(pet => pet.distance !== null && pet.distance <= selectedMaxRadius);

    if (processedList.length === 0) {
        petGrid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--gray-color);">
                <i class="fas fa-paw" style="font-size: 30px; margin-bottom: 10px; color: #ccc;"></i>
                <p>No available pets found within <strong>${selectedMaxRadius} km</strong> of your location.</p>
            </div>`;
        return;
    }

    // Sort closest first
    processedList.sort((a, b) => a.distance - b.distance);

    const seenCoordinates = {};

    processedList.forEach(pet => {
        let lat = parseFloat(pet.latitude);
        let lng = parseFloat(pet.longitude);

        const coordKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
        if (seenCoordinates[coordKey]) {
            lat += (Math.random() - 0.5) * 0.0003; 
            lng += (Math.random() - 0.5) * 0.0003; 
        } else {
            seenCoordinates[coordKey] = true;
        }

        const marker = L.marker([lat, lng]);
        marker.on('click', () => openPetModal(pet));
        markersLayer.addLayer(marker);

        const card = document.createElement('div');
        card.className = 'pet-card';
        card.setAttribute('data-pet-id', pet.id);
        
        const showFavorite = pet.owner_id !== currentUserId;

        card.innerHTML = `
            <img src="${pet.photo_url || 'https://via.placeholder.com/250x250?text=Pet'}" alt="${pet.name}"
                 onerror="this.src='https://via.placeholder.com/250x250?text=Pet'">
            <h3>${pet.name}</h3>
            <p style="margin-top:-10px;">${pet.health_status ? pet.health_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''}</p>
            <p>${pet.breed || pet.species} • ${formatAge(pet.age_months)} old</p>
            <p style="font-size:0.85rem; color:#666; margin: 4px 0 12px;"><i class="fas fa-car-side"></i> ${pet.distance.toFixed(2)} km away</p>
            <div class="pet-card-actions">
                <button class="btn btn-small btn-view-details">View Details</button>
                ${showFavorite ? `<button class="btn-favorite" data-pet-id="${pet.id}" title="Add to favorites"><i class="fas fa-heart"></i></button>` : ''}
            </div>
        `;
        
        card.addEventListener('click', () => {
            map.setView([lat, lng], 16);
            openPetModal(pet);
        });
        
        petGrid.appendChild(card);
    });

    // Refresh dynamic active/inactive button styles and logic
    await attachFavoriteHandlers();
}

// Renders the Latest "Featured" Pets (Always Visible)
async function renderFeaturedPets() {
    featuredGrid.innerHTML = '';

    if (allPetsData.length === 0) {
        featuredGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--gray-color);">No featured pets available.</div>`;
        return;
    }

    const latestPets = [...allPetsData]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    latestPets.forEach(pet => {
        const card = document.createElement('div');
        card.className = 'pet-card';
        card.setAttribute('data-pet-id', pet.id);
        
        const showFavorite = pet.owner_id !== currentUserId;

        let distanceHTML = '';
        if (userLocation && pet.latitude && pet.longitude) {
            const dist = calculateHaversineDistance(
                userLocation.lat, userLocation.lng,
                parseFloat(pet.latitude), parseFloat(pet.longitude)
            );
            distanceHTML = `<p style="font-size:0.85rem; color:#666; margin: 4px 0 12px;"><i class="fas fa-car-side"></i> ${dist.toFixed(2)} km away</p>`;
        }

        card.innerHTML = `
            <img src="${pet.photo_url || 'https://via.placeholder.com/250x250?text=Pet'}" alt="${pet.name}"
                 onerror="this.src='https://via.placeholder.com/250x250?text=Pet'">
            <h3>${pet.name}</h3>
            <p style="margin-top:-10px;">${pet.health_status ? pet.health_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''}</p>
            <p>${pet.breed || pet.species} • ${formatAge(pet.age_months)} old</p>
            ${distanceHTML}
            <div class="pet-card-actions">
                <button class="btn btn-small btn-view-details">View Details</button>
                ${showFavorite ? `<button class="btn-favorite" data-pet-id="${pet.id}" title="Add to favorites"><i class="fas fa-heart"></i></button>` : ''}
            </div>
        `;
        
        card.addEventListener('click', () => {
            if (pet.latitude && pet.longitude) {
                map.setView([parseFloat(pet.latitude), parseFloat(pet.longitude)], 16);
            }
            openPetModal(pet);
        });
        
        featuredGrid.appendChild(card);
    });

    // Refresh dynamic active/inactive button styles and logic
    await attachFavoriteHandlers();
}

// Replicated layout action attachment formula directly from index.html
async function attachFavoriteHandlers() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        const petIds = [...document.querySelectorAll('.btn-favorite')].map(b => b.dataset.petId);
        if (petIds.length) {
            const { data: existing } = await supabase.from('favorites')
                .select('pet_id').eq('user_id', session.user.id).in('pet_id', petIds);
            const favSet = new Set((existing || []).map(f => f.pet_id));
            document.querySelectorAll('.btn-favorite').forEach(btn => {
                if (favSet.has(btn.dataset.petId)) {
                    btn.classList.add('favorited');
                } else {
                    btn.classList.remove('favorited');
                }
            });
        }
    }

    document.querySelectorAll('.btn-favorite').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            if (btn.classList.contains('favorited')) {
                btn.style.borderColor = '#e8e6e6';
                btn.style.color = '#e0dada';
                btn.style.background = '#ffffff';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (btn.classList.contains('favorited')) {
                btn.style.borderColor = '';
                btn.style.color = '';
                btn.style.background = '';
            }
        });
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Stop map view jump or modal activation on click
            const petId = btn.dataset.petId;
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (!currentSession) {
                showAlertModal({
                    icon: '🔒',
                    title: 'Sign In Required',
                    message: 'Please sign in to save pets to your favorites.',
                    buttons: [
                        { label: 'Sign In', primary: true, onClick: () => window.location.href = 'login.html' },
                        { label: 'Cancel', primary: false }
                    ]
                });
                return;
            }
            try {
                const { data: existing } = await supabase.from('favorites')
                    .select('id').eq('user_id', currentSession.user.id).eq('pet_id', petId).maybeSingle();
                if (existing) {
                    await supabase.from('favorites').delete()
                        .eq('user_id', currentSession.user.id).eq('pet_id', petId);
                    btn.classList.remove('favorited');
                } else {
                    await supabase.from('favorites').insert({ user_id: currentSession.user.id, pet_id: petId });
                    btn.classList.add('favorited');
                }
                btn.style.borderColor = '';
                btn.style.color = '';
                btn.style.background = '';
            } catch (err) { console.error('Favorites error:', err); }
        });
    });
}

// Handles user location extraction using HTML Geolocation APIs
function handleGeolocation() {
    if (!navigator.geolocation) {
        showAlertModal({
            icon: '🌐',
            title: 'Not Supported',
            message: "Your web browser version doesn't support geolocation lookups."
        });
        return;
    }

    geoBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Locating...`;

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            locationDisplay.value = `📍 Your Location: ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
            geoBtn.innerHTML = `<i class="fas fa-check"></i> Located`;

            // Draw dynamic circle radius metrics and center map view
            updateMapCircle();
            
            // Render nearby cards to inject proximity arrays
            await renderPetsAndCards();
            await renderFeaturedPets(); // Updates distances instantly across both grids
        },
        (error) => {
            console.error("Location lookup fault detected:", error);
            showAlertModal({
                icon: '📍',
                title: 'Location Error',
                message: 'Unable to acquire your location. Please check your browser permissions and try again.'
            });
            geoBtn.innerHTML = `<i class="fas fa-crosshairs"></i> Use My Location`;
        }
    );
}

// Maps active selected record features accurately across modal layout elements
function openPetModal(pet) {
    document.getElementById('modal-pet-image').src = pet.photo_url || 'https://via.placeholder.com/250x250?text=Pet';
    document.getElementById('modal-pet-name').innerText = pet.name || 'Pet Details';
    
    document.getElementById('modal-pet-status').innerText = pet.health_status 
        ? pet.health_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) 
        : '';
        
    document.getElementById('modal-pet-meta').innerText = `${pet.breed || pet.species} • ${formatAge(pet.age_months)} old`;
    document.getElementById('modal-pet-address').innerText = pet.address || 'No location address listed';
    
    const distanceBox = document.getElementById('modal-pet-distance');
    
    if (userLocation && pet.latitude && pet.longitude) {
        const liveDist = calculateHaversineDistance(userLocation.lat, userLocation.lng, parseFloat(pet.latitude), parseFloat(pet.longitude));
        distanceBox.style.display = 'inline-block';
        distanceBox.innerText = `📍 Approximately ${liveDist.toFixed(2)} km away from you`;
    } else {
        distanceBox.style.display = 'none';
    }

    document.getElementById('modal-view-info-btn').href = `pet.html?id=${pet.id}`;
    
    toggleModal();
}

function toggleModal() {
    modal.classList.toggle('active');
}