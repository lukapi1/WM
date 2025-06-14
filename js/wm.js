import supabase from './common/supabase.js';

/**
 * Konfiguracja aplikacji
 */
const config = { 
  wheelieThreshold: 5, 
  dangerThreshold: 30, 
  updateInterval: 50 
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
  wheelieAngles: [],
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
    elements.startBtn.addEventListener('click', () => {
      requestPermission().then(granted => {
        if (granted) {
          elements.startBtn.textContent = "START";
          elements.startBtn.removeEventListener('click', requestPermission);
          elements.startBtn.addEventListener('click', toggleMeasurement);
        }
      });
    });
  } else {
    setupSensor();
    elements.startBtn.addEventListener('click', toggleMeasurement);
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

  if (!state.unsavedResults) {
    alert("Te wyniki już zostały zapisane.");
    return;
  }

  elements.saveBtn.disabled = true;
  elements.status.textContent = "Zapisywanie do bazy...";

  try {
    const sessionId = state.sessionId;

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

    elements.status.textContent = `✅ Zapisano ${entries.length} wyników (sesja ${sessionId.slice(0, 8)}...)`;
    showNotification(`Zapisano ${entries.length} wyników ✅`, 'success');

    // Wyłączenie dalszego zapisu
    state.unsavedResults = null;
    state.measurements = [];
    elements.saveBtn.disabled = true;
    elements.resetBtn.disabled = true;
  } catch (error) {
    elements.status.textContent = `❌ Błąd zapisu: ${error.message}`;
    showNotification("❌ Błąd zapisu do bazy!", 'error');
    console.error("Błąd zapisu:", error);
    elements.saveBtn.disabled = false;
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
  return DeviceOrientationEvent.requestPermission()
    .then(response => {
      if (response === 'granted') {
        setupSensor();
        return true;
      } else {
        elements.status.textContent = "Brak dostępu do czujników";
        return false;
      }
    })
    .catch(error => {
      console.error(error);
      return false;
    });
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

  // Nowe obliczenia dla paska (25° = 50% wypełnienia)
  const maxAngle = 50; // Maksymalny kąt (100% wypełnienia)
  let fillPercentage;
  
  if (angle <= 25) {
    // 0–25° → 0–50% wypełnienia
    fillPercentage = (angle / 25) * 50;
  } else {
    // 25–50° → 50–100% wypełnienia
    fillPercentage = 50 + ((angle - 25) / (maxAngle - 25)) * 50;
  }

  elements.gaugeFill.style.width = Math.min(fillPercentage, 100) + "%";

  // Reszta funkcji bez zmian (kolory, statusy itd.)
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
      state.wheelieAngles = [angle]; // Inicjalizacja tablicy
    } else {
      state.maxAngle = Math.max(state.maxAngle, angle);
      state.wheelieAngles.push(angle); // Dodajemy kolejny kąt
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
  
  // Oblicz średni kąt z wszystkich pomiarów podczas tego wheelie
  const avgAngle = state.wheelieAngles.reduce((sum, a) => sum + a, 0) / state.wheelieAngles.length;
  
  const measurement = {
    angle: state.maxAngle,
    avgAngle: avgAngle, // Dodajemy średni kąt
    time: duration,
    date: new Date().toLocaleTimeString(),
    duration: duration
  };
  
  state.measurements.unshift(measurement);
  state.unsavedResults = measurement;
  updateHistory(measurement);
  
  // Resetujemy tablicę kątów dla następnego wheelie
  state.wheelieAngles = [];
  
  elements.status.textContent = `Wheelie: ${duration.toFixed(2)}s (max: ${state.maxAngle.toFixed(1)}°, avg: ${avgAngle.toFixed(1)}°)`;
  elements.saveBtn.disabled = false;

  // Krótka blokada przed następnym wheelie
  state.isMeasuring = false;
  setTimeout(() => {
    state.isMeasuring = true;
  }, 1000);
}

/**
 * Dodaje wpis do historii
 */
function updateHistory(measurement) {
  const entry = document.createElement('div');
  entry.innerHTML = `
    <div class="history-entry">
      <span class="history-time">${measurement.date}</span>
      <span class="history-duration">${measurement.duration.toFixed(2)}s</span>
      <span class="history-max-angle">${measurement.angle.toFixed(1)}°</span>
      <span class="history-avg-angle">${measurement.avgAngle.toFixed(1)}°</span>
    </div>
  `;
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
 * Pokazuje widoczny komunikat (powiadomienie)
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.left = '50%';
  notification.style.transform = 'translateX(-50%)';
  notification.style.backgroundColor = type === 'success' ? '#4caf50' :
                                       type === 'error' ? '#f44336' : '#2196f3';
  notification.style.color = '#fff';
  notification.style.padding = '12px 24px';
  notification.style.borderRadius = '8px';
  notification.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
  notification.style.zIndex = '9999';
  notification.style.fontSize = '16px';
  document.body.appendChild(notification);

  setTimeout(() => {
    document.body.removeChild(notification);
  }, 4000);
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
