import supabase from './common/supabase.js';

/**
 * Konfiguracja aplikacji - wartości progowe i interwały
 * @property {number} wheelieThreshold - Minimalny kąt (w stopniach) uznawany za wheelie
 * @property {number} dangerThreshold - Kąt uznawany za niebezpieczny
 * @property {number} updateInterval - Częstotliwość aktualizacji pomiaru (ms)
 */
const config = { 
  wheelieThreshold: 20, 
  dangerThreshold: 45, 
  updateInterval: 100 
};

/**
 * Główny stan aplikacji przechowujący wszystkie dynamiczne dane
 * @property {string|null} nickname - Nick użytkownika
 * @property {boolean} isMeasuring - Czy pomiar jest aktywny
 * @property {boolean} isWheelie - Czy wykryto wheelie
 * @property {number} startTime - Czas rozpoczęcia wheelie (timestamp)
 * @property {number} currentAngle - Aktualny kąt nachylenia
 * @property {number} maxAngle - Maksymalny osiągnięty kąt w obecnym wheelie
 * @property {number} calibrationOffset - Wartość kalibracji (kompensacja)
 * @property {Array} measurements - Tablica przechowująca historię pomiarów
 * @property {boolean} isLightMode - Czy tryb jasny jest aktywny
 */
const state = {
  nickname: null,
  isMeasuring: false,
  isWheelie: false,
  startTime: 0,
  currentAngle: 0,
  maxAngle: 0,
  calibrationOffset: 0,
  measurements: [],
  isLightMode: false
};

/**
 * Referencje do elementów DOM
 * @type {Object}
 */
const elements = {
  angleDisplay: document.getElementById('angle-display'),
  timeDisplay: document.getElementById('time-display'),
  status: document.getElementById('status'),
  gaugeFill: document.getElementById('gauge-fill'),
  startBtn: document.getElementById('startBtn'),
  calibrateBtn: document.getElementById('calibrateBtn'),
  themeBtn: document.getElementById('themeBtn'),
  history: document.getElementById('history'),
  calibrationValue: document.getElementById('calibration-value')
};

/**
 * Inicjalizacja aplikacji - ustawia event listeners i sprawdza dostępność czujników
 */
function init() {
  // Nasłuchiwanie zdarzeń przycisków
  elements.startBtn.addEventListener('click', toggleMeasurement);
  elements.calibrateBtn.addEventListener('click', calibrate);
  elements.themeBtn.addEventListener('click', toggleTheme);
  
  // Wczytanie ustawień z localStorage
  loadSettings();
  
  // Sprawdzenie czy urządzenie wspiera czujniki orientacji
  if (!window.DeviceOrientationEvent) {
    elements.status.textContent = "Twoje urządzenie nie wspiera czujników orientacji";
    elements.startBtn.disabled = true;
    return;
  }
  
  // Specjalna obsługa dla iOS (wymaga uprawnień)
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    elements.startBtn.textContent = "DOTKNIJ ABY ZACZĄĆ";
    elements.startBtn.addEventListener('click', requestPermission);
  } else {
    // Dla innych urządzeń od razu uruchamiamy czujnik
    setupSensor();
  }
}

/**
 * Przełącza stan pomiaru (start/stop)
 * Jeśli to pierwsze uruchomienie, prosi o podanie nicku
 */
function toggleMeasurement() {
  // Prośba o nick przy pierwszym uruchomieniu
  if (!state.isMeasuring && !state.nickname) {
    const name = prompt("Podaj swój nick:");
    if (!name) {
      alert("Nick jest wymagany do zapisu wyników.");
      return;
    }
    state.nickname = name.trim();
  }
  
  // Zmiana stanu pomiaru
  state.isMeasuring = !state.isMeasuring;
  
  if (state.isMeasuring) {
    // Przygotowanie do nowego pomiaru
    elements.startBtn.textContent = "STOP";
    elements.status.textContent = "Czekam na wheelie...";
    state.measurements = [];
    elements.history.innerHTML = "";
    elements.timeDisplay.textContent = "0.00s";
  } else {
    // Zatrzymanie pomiaru
    elements.startBtn.textContent = "START";
    elements.status.textContent = "Pomiar zatrzymany";
    if (state.isWheelie) {
      endWheelie();
    }
  }
}

/**
 * Kończy aktualne wheelie, zapisuje wynik i aktualizuje UI
 */
function endWheelie() {
  state.isWheelie = false;
  const endTime = Date.now();
  const duration = (endTime - state.startTime) / 1000;
  
  // Tworzenie obiektu pomiaru
  const measurement = {
    angle: state.maxAngle,
    time: duration,
    date: new Date().toLocaleTimeString()
  };
  
  // Aktualizacja historii
  state.measurements.unshift(measurement);
  updateHistory(measurement);
  
  // Aktualizacja UI
  elements.status.textContent = `Wheelie: ${duration.toFixed(2)}s (${state.maxAngle.toFixed(1)}°)`;
  
  // Zapisz do Supabase jeśli jest nick
  if (state.nickname) {
    saveResultToSupabase(duration);
  } else {
    console.warn("⚠️ Brak nicku – nie zapisano do Supabase");
  }
}

/**
 * Zapisuje wynik wheelie do bazy danych Supabase
 * @param {number} duration - Czas trwania wheelie w sekundach
 */
async function saveResultToSupabase(duration) {
  try {
    const { error } = await supabase
      .from('wheelie_results')
      .insert({
        nickname: state.nickname,
        angle: parseFloat(state.maxAngle.toFixed(1)),
        duration: parseFloat(duration.toFixed(2)),
        device: navigator.userAgent
      });
    
    if (error) throw error;
    
    console.log("✅ Zapisano wynik w Supabase");
    elements.status.textContent += " | Zapisano!";
  } catch (error) {
    console.error("❌ Błąd zapisu do Supabase:", error.message);
    elements.status.textContent += " | Błąd zapisu!";
  }
}

/**
 * Kalibruje czujnik do aktualnej pozycji urządzenia
 */
function calibrate() {
  if (state.isMeasuring) {
    alert("Zatrzymaj pomiar przed kalibracją");
    return;
  }
  
  if (state.currentAngle !== null) {
    state.calibrationOffset = state.currentAngle;
    updateCalibrationDisplay();
    saveSettings();
    elements.status.textContent = "Wykalibrowano do aktualnej pozycji";
  }
}

/**
 * Aktualizuje wyświetlaną wartość kalibracji
 */
function updateCalibrationDisplay() {
  elements.calibrationValue.textContent = `Kalibracja: ${state.calibrationOffset.toFixed(1)}°`;
}

/**
 * Prosi o uprawnienia do czujników na iOS
 */
function requestPermission() {
  DeviceOrientationEvent.requestPermission()
    .then(response => {
      if (response === 'granted') {
        setupSensor();
        elements.startBtn.textContent = "START";
        elements.startBtn.removeEventListener('click', requestPermission);
        elements.startBtn.addEventListener('click', toggleMeasurement);
      } else {
        elements.status.textContent = "Brak dostępu do czujników - aplikacja nie będzie działać";
      }
    })
    .catch(console.error);
}

/**
 * Ustawia nasłuchiwanie zdarzenia orientacji urządzenia
 */
function setupSensor() {
  window.addEventListener('deviceorientation', handleOrientation);
}

/**
 * Obsługuje zdarzenie zmiany orientacji urządzenia
 * @param {DeviceOrientationEvent} event - Obiekt zdarzenia orientacji
 */
function handleOrientation(event) {
  if (!state.isMeasuring) return;
  
  // Obliczanie skompensowanego kąta
  let angle = Math.abs(event.beta);
  angle = Math.abs(angle - state.calibrationOffset);
  state.currentAngle = angle;
  
  // Aktualizacja UI i sprawdzanie wheelie
  updateDisplay(angle);
  checkWheelie(angle);
}

/**
 * Aktualizuje interfejs użytkownika na podstawie aktualnego kąta
 * @param {number} angle - Aktualny kąt nachylenia
 */
function updateDisplay(angle) {
  const roundedAngle = Math.round(angle * 10) / 10;
  elements.angleDisplay.textContent = roundedAngle + "°";
  elements.gaugeFill.style.width = Math.min(angle, 100) + "%";
  
  // Zmiana koloru i statusu w zależności od kąta
  if (angle >= config.dangerThreshold) {
    elements.angleDisplay.style.color = "var(--primary-color)";
    elements.status.textContent = "UWAGA! ZBYT DUŻY KĄT!";
  } else if (angle >= config.wheelieThreshold) {
    elements.angleDisplay.style.color = "var(--success-color)";
    elements.status.textContent = "WHEELIE!";
  } else {
    elements.angleDisplay.style.color = "var(--primary-color)";
    elements.status.textContent = "Gotowy do pomiaru";
  }
  
  // Aktualizacja czasu trwania jeśli wheelie trwa
  if (state.isWheelie) {
    const currentTime = (Date.now() - state.startTime) / 1000;
    elements.timeDisplay.textContent = currentTime.toFixed(2) + "s";
  }
}

/**
 * Sprawdza czy aktualny kąt kwalifikuje się jako wheelie
 * @param {number} angle - Aktualny kąt nachylenia
 */
function checkWheelie(angle) {
  if (angle >= config.wheelieThreshold) {
    if (!state.isWheelie) {
      // Rozpoczęcie nowego wheelie
      state.isWheelie = true;
      state.startTime = Date.now();
      state.maxAngle = angle;
    } else {
      // Aktualizacja maksymalnego kąta
      state.maxAngle = Math.max(state.maxAngle, angle);
    }
  } else {
    // Zakończenie wheelie jeśli kąt spadł poniżej progu
    if (state.isWheelie) {
      endWheelie();
    }
  }
}

/**
 * Dodaje wpis do historii pomiarów
 * @param {Object} measurement - Obiekt pomiaru
 */
function updateHistory(measurement) {
  const entry = document.createElement('div');
  entry.textContent = `${measurement.date}: ${measurement.time.toFixed(2)}s (${measurement.angle.toFixed(1)}°)`;
  elements.history.insertBefore(entry, elements.history.firstChild);
}

/**
 * Przełącza między trybem jasnym i ciemnym
 */
function toggleTheme() {
  if (state.isLightMode) {
    document.body.classList.remove('light-mode');
    elements.themeBtn.textContent = "TRYB JASNY";
  } else {
    document.body.classList.add('light-mode');
    elements.themeBtn.textContent = "TRYB CIEMNY";
  }
  
  state.isLightMode = !state.isLightMode;
  saveSettings();
}

/**
 * Włącza tryb jasny (używane przy ładowaniu ustawień)
 */
function enableLightMode() {
  document.body.classList.add('light-mode');
  elements.themeBtn.textContent = "TRYB CIEMNY";
  state.isLightMode = true;
}

/**
 * Wczytuje ustawienia z localStorage
 */
function loadSettings() {
  const savedTheme = localStorage.getItem('wheelieMeterTheme');
  if (savedTheme === 'light') enableLightMode();
  
  const savedCalibration = localStorage.getItem('wheelieMeterCalibration');
  if (savedCalibration) {
    state.calibrationOffset = parseFloat(savedCalibration);
    updateCalibrationDisplay();
  }
}

/**
 * Zapisuje ustawienia do localStorage
 */
function saveSettings() {
  localStorage.setItem('wheelieMeterTheme', state.isLightMode ? 'light' : 'dark');
  localStorage.setItem('wheelieMeterCalibration', state.calibrationOffset.toString());
}

// Inicjalizacja aplikacji po załadowaniu DOM
document.addEventListener('DOMContentLoaded', init);
