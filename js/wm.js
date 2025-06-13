import supabase from './common/supabase.js';

/**
 * Konfiguracja aplikacji
 */
const config = { 
  wheelieThreshold: 20, 
  dangerThreshold: 45, 
  updateInterval: 100 
};

/**
 * Główny stan aplikacji
 */
const state = {
  nickname: null,
  isMeasuring: false,
  isWheelie: false,
  isSessionActive: false,
  startTime: 0,
  currentAngle: 0,
  maxAngle: 0,
  calibrationOffset: 0,
  measurements: [],
  isLightMode: false,
  unsavedResults: null,
  sessionId: generateSessionId()
};

/**
 * Generuje losowe ID sesji (UUID v4)
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Referencje do elementów DOM
 */
const elements = {
  angleDisplay: document.getElementById('angle-display'),
  timeDisplay: document.getElementById('time-display'),
  status: document.getElementById('status'),
  gaugeFill: document.getElementById('gauge-fill'),
  startBtn: document.getElementById('startBtn'),
  resetBtn: document.getElementById('resetBtn'),
  saveBtn: document.getElementById('saveBtn'),
  calibrateBtn: document.getElementById('calibrateBtn'),
  themeBtn: document.getElementById('themeBtn'),
  history: document.getElementById('history'),
  calibrationValue: document.getElementById('calibration-value')
};

/**
 * Inicjalizacja aplikacji
 */
function init() {
  elements.startBtn.addEventListener('click', toggleMeasurement);
  elements.resetBtn.addEventListener('click', resetSession);
  elements.saveBtn.addEventListener('click', saveSession);
  elements.calibrateBtn.addEventListener('click', calibrate);
  elements.themeBtn.addEventListener('click', toggleTheme);
  
  elements.resetBtn.disabled = true;
  elements.saveBtn.disabled = true;
  
  loadSettings();
  
  if (!window.DeviceOrientationEvent) {
    elements.status.textContent = "Twoje urządzenie nie wspiera czujników orientacji";
    elements.startBtn.disabled = true;
    return;
  }

  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    elements.startBtn.textContent = "DOTKNIJ ABY ZACZĄĆ";
    elements.startBtn.addEventListener('click', requestPermission);
  } else {
    setupSensor();
  }
}

/**
 * Rozpoczyna pomiar
 */
function toggleMeasurement() {
  if (!state.nickname) {
    const name = prompt("Podaj swój nick (min. 3 znaki):");
    if (!validateNickname(name)) {
      alert("Nick musi mieć 3-20 znaków");
      return;
    }
    state.nickname = name.trim();
  }

  state.isSessionActive = true;
  state.isMeasuring = true;
  elements.startBtn.disabled = true;
  elements.resetBtn.disabled = false;
  elements.status.textContent = "Czekam na wheelie...";
}

/**
 * Resetuje sesję
 */
function resetSession() {
  if (confirm("Czy na pewno chcesz zresetować sesję? Wyniki nie zostaną zapisane.")) {
    state.isSessionActive = false;
    state.isMeasuring = false;
    state.isWheelie = false;
    state.measurements = [];
    state.unsavedResults = null;
    state.sessionId = generateSessionId(); // Nowa sesja
    elements.history.innerHTML = "";
    elements.timeDisplay.textContent = "0.00s";
    elements.startBtn.disabled = false;
    elements.resetBtn.disabled = true;
    elements.saveBtn.disabled = true;
    elements.status.textContent = "Gotowy do pomiaru";
    elements.angleDisplay.textContent = "0°";
    elements.gaugeFill.style.width = "0%";
  }
}

/**
 * Zapisuje wyniki do bazy danych
 */
async function saveSession() {
  if (!state.measurements || state.measurements.length === 0) {
    alert("Brak wyników do zapisania!");
    return;
  }

  elements.saveBtn.disabled = true;
  elements.status.textContent = "Zapisywanie...";

  try {
    const sessionId = crypto.randomUUID(); // unikalne ID sesji

    const entries = state.measurements.map(m => ({
      nickname: state.nickname,
      angle: parseFloat(m.angle.toFixed(1)),
      duration: parseFloat(m.duration.toFixed(2)),
      created_at: new Date().toISOString(),
      device: navigator.userAgent.substring(0, 100),
      session_id: sessionId
    }));

    const { error } = await supabase.from('wheelie_results').insert(entries);

    if (error) throw error;

    elements.status.textContent = `Zapisano ${entries.length} wyników (sesja ${sessionId.slice(0, 8)}...)`;
    state.unsavedResults = null;
    state.measurements = [];
    elements.saveBtn.disabled = true;
    elements.resetBtn.disabled = true;
  } catch (error) {
    elements.saveBtn.disabled = false;
    elements.status.textContent = `Błąd zapisu: ${error.message}`;
    console.error("Błąd zapisu:", error);
  }
}

/**
 * Kalibruje czujnik
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
 * Prosi o uprawnienia na iOS
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
        elements.status.textContent = "Brak dostępu do czujników";
      }
    })
    .catch(console.error);
}

/**
 * Ustawia nasłuchiwanie czujnika
 */
function setupSensor() {
  window.addEventListener('deviceorientation', handleOrientation);
}

/**
 * Obsługuje dane z czujnika
 */
function handleOrientation(event) {
  if (!state.isMeasuring) return;
  
  let angle = Math.abs(event.beta);
  angle = Math.abs(angle - state.calibrationOffset);
  state.currentAngle = angle;
  
  updateDisplay(angle);
  checkWheelie(angle);
}

/**
 * Aktualizuje interfejs
 */
function updateDisplay(angle) {
  const roundedAngle = Math.round(angle * 10) / 10;
  elements.angleDisplay.textContent = roundedAngle + "°";
  elements.gaugeFill.style.width = Math.min(angle, 100) + "%";
  
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
  
  if (state.isWheelie) {
    const currentTime = (Date.now() - state.startTime) / 1000;
    elements.timeDisplay.textContent = currentTime.toFixed(2) + "s";
  }
}

/**
 * Sprawdza czy wykryto wheelie
 */
function checkWheelie(angle) {
  if (angle >= config.wheelieThreshold) {
    if (!state.isWheelie) {
      state.isWheelie = true;
      state.startTime = Date.now();
      state.maxAngle = angle;
    } else {
      state.maxAngle = Math.max(state.maxAngle, angle);
    }
  } else {
    if (state.isWheelie) {
      endWheelie();
    }
  }
}

/**
 * Kończy wheelie i przygotowuje dane
 */
function endWheelie() {
  state.isWheelie = false;
  const endTime = Date.now();
  const duration = (endTime - state.startTime) / 1000;
  
  const measurement = {
    angle: state.maxAngle,
    time: duration,
    date: new Date().toLocaleTimeString(),
    duration: duration
  };
  
  state.measurements.unshift(measurement);
  state.unsavedResults = measurement;
  updateHistory(measurement);
  
  elements.status.textContent = `Wheelie: ${duration.toFixed(2)}s (${state.maxAngle.toFixed(1)}°)`;
  elements.saveBtn.disabled = false;
}

/**
 * Dodaje wpis do historii
 */
function updateHistory(measurement) {
  const entry = document.createElement('div');
  entry.textContent = `${measurement.date}: ${measurement.time.toFixed(2)}s (${measurement.angle.toFixed(1)}°)`;
  elements.history.insertBefore(entry, elements.history.firstChild);
}

/**
 * Waliduje nick
 */
function validateNickname(name) {
  return name && name.trim().length >= 3 && name.trim().length <= 20;
}

/**
 * Przełącza tryb jasny/ciemny
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
 * Włącza tryb jasny
 */
function enableLightMode() {
  document.body.classList.add('light-mode');
  elements.themeBtn.textContent = "TRYB CIEMNY";
  state.isLightMode = true;
}

/**
 * Wczytuje ustawienia
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
 * Zapisuje ustawienia
 */
function saveSettings() {
  localStorage.setItem('wheelieMeterTheme', state.isLightMode ? 'light' : 'dark');
  localStorage.setItem('wheelieMeterCalibration', state.calibrationOffset.toString());
}

// Inicjalizacja aplikacji
document.addEventListener('DOMContentLoaded', init);
