// Inicjalizacja klienta Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const supabaseUrl = 'https://ixxjlwqchhdqogrhuafo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4eGpsd3FjaGhkcW9ncmh1YWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5MzU0NjAsImV4cCI6MjA2NDUxMTQ2MH0.axoe0XItrANtM1tim71gYNkwQb9SX_B5AZaQXfHCBlA';

const supabase = createClient(supabaseUrl, supabaseKey);

// Główne eksporty
export default supabase;

export const auth = {
  // Logowanie/rejestracja
  async signIn(email, password) {
    return await supabase.auth.signInWithPassword({ email, password });
  },
  
  async signUp(email, password) {
    return await supabase.auth.signUp({ email, password });
  },

  // Sesja
  async getSession() {
    return await supabase.auth.getSession();
  },
  
  async signOut() {
    return await supabase.auth.signOut();
  },

  // Informacje o użytkowniku
  async getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }
};

export const results = {
  // Pobieranie wyników
  async getUserResults(userId) {
    return await supabase
      .from('results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
  },

  // Zapis wyników
  async saveResults(entries) {
    return await supabase
      .from('results')
      .insert(entries)
      .select();
  },

  // Inne operacje na wynikach
  async deleteResult(resultId) {
    return await supabase
      .from('results')
      .delete()
      .eq('id', resultId);
  }
};

// Dodatkowe funkcje pomocnicze
export const helpers = {
  async checkAuth() {
    const { data: { session }, error } = await auth.getSession();
    if (error || !session) {
      throw new Error('Nieautoryzowany dostęp');
    }
    return session.user;
  }
};
