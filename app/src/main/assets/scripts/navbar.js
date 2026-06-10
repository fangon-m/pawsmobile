const SUPABASE_URL = 'https://dgnhjgzhmzwrresutteg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnbmhqZ3pobXp3cnJlc3V0dGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTA0NjAsImV4cCI6MjA5NTk2NjQ2MH0.TAhi4nCMel41hbELrzo47lyv6PGcjxZQizv1MUad5XA';

// Assign the promise SYNCHRONOUSLY so any script that does
// "await window.navbarReady" always gets a real Promise, never undefined
window.navbarReady = (async () => {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let isLoggedIn = false;
    let currentUser = null;
    let isSigningOut = false;
    let isSigningUp = false;
    let avatarUrl = null;
    let unreadMessageCount = 0;
    let messageSubscription = null;

    function getBasePath() {
        return window.location.pathname.includes('/pages/') ? '../' : './';
    }

    const basePath = getBasePath();

    function createNavbar() {
        const navbar = document.getElementById('navbar');
        if (!navbar) return;

        navbar.innerHTML = `
            <style>
                .message-badge {
                    position: absolute;
                    top: -8px;
                    right: -8px;
                    background: #ff4444;
                    color: white;
                    border-radius: 50%;
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                    border: 2px solid white;
                }
                #messages-item {
                    position: relative;
                }
            </style>
            <div class="navbar">
                <div class="navbar-container">
                    <div class="navbar-brand">
                        <img src="${basePath}images/logo-02.png" alt="Paws & Pals Logo" class="brand-logo" style="width:40px; height:40px; margin-right:5px;">
                        <span class="brand-title">Paws & Pals</span>
                    </div>
                    <button class="hamburger" id="hamburger-menu">
                        <span></span><span></span><span></span>
                    </button>
                    <ul class="nav-links" id="nav-links">
                        <li><a href="${basePath}index.html" class="nav-link">Home</a></li>
                        <li><a href="${basePath}pages/maps.html" class="nav-link">Pets</a></li>
                        <li id="favorites-item" ${isLoggedIn ? '' : 'style="display:none;"'}>
                            <a href="${basePath}pages/favorites.html" class="nav-link">Favorites</a>
                        </li>
                        <li id="adoptions-item" ${isLoggedIn ? '' : 'style="display:none;"'}>
                            <a href="${basePath}pages/adoptions.html" class="nav-link">Adoptions</a>
                        </li>
                        <li id="messages-item" ${isLoggedIn ? '' : 'style="display:none;"'}>
                            <a href="${basePath}pages/messages.html" class="nav-link nav-icon" title="Messages" style="position: relative;">
                                <i class="fas fa-envelope"></i>
                                <span class="message-badge" id="message-badge" style="display:none;">0</span>
                            </a>
                        </li>
                        <li id="signin-item" ${isLoggedIn || window.location.pathname.includes('login.html') || window.location.pathname.includes('signup.html') ? 'style="display:none;"' : ''}>
                            <a href="${basePath}pages/login.html" class="nav-link btn-signin">Sign In</a>
                        </li>
                        <li id="user-menu" ${isLoggedIn ? '' : 'style="display:none;"'} class="user-menu">
                            <button class="user-menu-toggle" id="user-menu-toggle">
                                ${avatarUrl
                                    ? `<img src="${avatarUrl}" alt="avatar" class="nav-avatar">`
                                    : `<i class="fas fa-user-circle"></i>`
                                } ${currentUser || 'User'}
                            </button>
                            <ul class="user-menu-dropdown" id="user-menu-dropdown">
                                <li><a href="${basePath}pages/account.html">My Account</a></li>
                                <li><a href="${basePath}pages/pet-profiles.html">My Pet Profiles</a></li>
                                <li><hr></li>
                                <li><a href="${basePath}pages/login.html" id="logout-btn">Logout</a></li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>
        `;

        // Highlight active nav link
        const currentPath = window.location.pathname;
        document.querySelectorAll('.nav-link').forEach(link => {
            const url = new URL(link.getAttribute('href'), window.location.href);
            if (currentPath === url.pathname) link.classList.add('active');
        });

        setupEventListeners();
    }

    function setupEventListeners() {
        const hamburger = document.getElementById('hamburger-menu');
        const navLinks = document.getElementById('nav-links');

        hamburger?.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            hamburger.classList.toggle('active');
        });

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                hamburger?.classList.remove('active');
            });
        });

        // Clear notification when visiting messages page
        const messagesLink = document.querySelector('#messages-item .nav-link');
        if (messagesLink) {
            messagesLink.addEventListener('click', () => {
                unreadMessageCount = 0;
                updateMessageBadge();
            });
        }

        const userMenuToggle = document.getElementById('user-menu-toggle');
        const userMenuDropdown = document.getElementById('user-menu-dropdown');

        if (userMenuToggle) {
            userMenuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                userMenuDropdown.classList.toggle('show');
            });
            document.addEventListener('click', (e) => {
                if (!userMenuToggle.contains(e.target) && !userMenuDropdown?.contains(e.target)) {
                    userMenuDropdown?.classList.remove('show');
                }
            });
        }

        document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            isSigningOut = true;
            await supabase.auth.signOut();
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sb-')) localStorage.removeItem(key);
            });
            isLoggedIn = false;
            currentUser = null;
            avatarUrl = null;
            unreadMessageCount = 0;
            if (messageSubscription) {
                messageSubscription.unsubscribe();
                messageSubscription = null;
            }
            createNavbar();
            window.location.href = basePath + 'index.html';
        });
    }

    function updateMessageBadge() {
        const badge = document.getElementById('message-badge');
        console.log('[Badge] Element found:', !!badge, 'Count:', unreadMessageCount);
        if (!badge) return;

        if (unreadMessageCount > 0) {
            badge.textContent = unreadMessageCount;
            badge.style.display = 'flex';
            console.log('[Badge] Showing:', unreadMessageCount);
        } else {
            badge.style.display = 'none';
            console.log('[Badge] Hidden');
        }
    }

    // FIX: Filters unread messages strictly to conversations where the current user is a participant
    window.refreshUnreadCount = async function() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: conversations, error } = await supabase
            .from('conversations')
            .select('messages(id)')
            .or(`user_one.eq.${session.user.id},user_two.eq.${session.user.id}`)
            .eq('messages.is_read', false)
            .neq('messages.sender_id', session.user.id);

        if (!error && conversations) {
            unreadMessageCount = conversations.reduce((acc, conv) => acc + (conv.messages?.length || 0), 0);
            updateMessageBadge();
        } else if (error) {
            console.error('[Notifications] Error fetching count:', error);
        }
    };

    // FIX: Bridges reference so components in messages.html clear out unread states live
    window._navbarResetBadge = window.refreshUnreadCount;

    function setupMessageNotifications() {
        console.log('[Notifications] Setup called. isLoggedIn:', isLoggedIn, 'currentUser:', currentUser);
        if (!isLoggedIn || !currentUser) return;

        if (messageSubscription) {
            messageSubscription.unsubscribe();
        }

        // Listens to '*' (ALL changes: INSERTS, UPDATES, DELETES) so deletions or read flags sync automatically
        messageSubscription = supabase
            .channel('navbar-messages')
            .on('postgres_changes', {
                event: '*', 
                schema: 'public',
                table: 'messages'
            }, async (payload) => {
                console.log('[Notifications] Message table database change detected:', payload.eventType);
                
                // Recalculate badge total directly from the source of truth
                if (typeof window.refreshUnreadCount === 'function') {
                    await window.refreshUnreadCount();
                }
            })
            .subscribe();
    }

    // ─── Auth Functions ───────────────────────────────────────────────────────

    window.signup = async function(email, password, firstName, lastName, username) {
        isSigningUp = true;
        const { data, error } = await supabase.auth.signUp({
            email, password,
            options: { data: { first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}` } }
        });
        if (error) { isSigningUp = false; alert(error.message); return false; }

        const { error: profileError } = await supabase
            .from('profiles')
            .insert({ id: data.user.id, username, full_name: `${firstName} ${lastName}` });

        if (profileError) { isSigningUp = false; alert('Profile setup failed: ' + profileError.message); return false; }

        await supabase.auth.signOut();
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-')) localStorage.removeItem(key);
        });
        isSigningUp = false;
        return true;
    };

    window.login = async function(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { alert(error.message); return false; }

        const { data: profile } = await supabase
            .from('profiles').select('username, avatar_url').eq('id', data.user.id).single();

        isLoggedIn = true;
        currentUser = profile?.username;
        avatarUrl = profile?.avatar_url || null;
        window.location.href = basePath + 'index.html';
        return true;
    };

    window._supabase = supabase;

    // ─── Init ─────────────────────────────────────────────────────────────────

    const { data: { session } } = await supabase.auth.getSession();
    if (session && !isSigningOut) {
        isLoggedIn = true;
        const { data: profile } = await supabase
            .from('profiles').select('username, avatar_url').eq('id', session.user.id).single();
        currentUser = profile?.username;
        avatarUrl = profile?.avatar_url || null;
        console.log('[Navbar] Session loaded. User:', currentUser);
    }

    createNavbar();
    console.log('[Navbar] calling setupMessageNotifications from init');
    setupMessageNotifications();

    if (isLoggedIn) window.refreshUnreadCount();

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            isLoggedIn = false;
            currentUser = null;
            avatarUrl = null;
            unreadMessageCount = 0;
            if (messageSubscription) {
                messageSubscription.unsubscribe();
                messageSubscription = null;
            }
            createNavbar();
            return;
        }
        if (isSigningOut || isSigningUp) return;

        isLoggedIn = !!session;
        if (session) {
            // Defer the async database operation to prevent internal auth queue deadlocks
            setTimeout(async () => {
                try {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('username, avatar_url')
                        .eq('id', session.user.id)
                        .single();
                    
                    currentUser = profile?.username || null;
                    avatarUrl = profile?.avatar_url || null;
                    window.refreshUnreadCount();
                } catch (err) {
                    console.error("Error fetching profile on auth event:", err);
                } finally {
                    // Update UI elements only after the profile has been processed
                    createNavbar();
                    setupMessageNotifications();
                }
            }, 0);
        } else {
            currentUser = null;
            avatarUrl = null;
            createNavbar();
            setupMessageNotifications();
        }
    });
})();