import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://dgnhjgzhmzwrresutteg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnbmhqZ3pobXp3cnJlc3V0dGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTA0NjAsImV4cCI6MjA5NTk2NjQ2MH0.TAhi4nCMel41hbELrzo47lyv6PGcjxZQizv1MUad5XA';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)