const initialBankrollInput = document.getElementById('initialBankroll');
const stakePctInput = document.getElementById('stakePct');
const withdrawPctInput = document.getElementById('withdrawPct');
const cyclesInput = document.getElementById('cycles');
const startDateInput = document.getElementById('startDate');
const generateBtn = document.getElementById('generateBtn');
const planBody = document.getElementById('planBody');
const netWorthValue = document.getElementById('netWorthValue');
const lastBankrollValue = document.getElementById('lastBankrollValue');
const totalWithdrawValue = document.getElementById('totalWithdrawValue');

function getStorageKey() {
  const pageName = (window.location.pathname.split('/').pop() || 'index').replace('.html', '');
  return `safe-grow-state-${pageName.toLowerCase()}`;
}

function getStorageCandidates() {
  const pageName = (window.location.pathname.split('/').pop() || 'index').replace('.html', '');
  return [
    `safe-grow-state-${pageName.toLowerCase()}`,
    `safe-grow-state-${pageName}`
  ];
}

const storageKey = getStorageKey();

const state = {
  initialBankroll: Number(initialBankrollInput.value) || 500,
  stakePct: Number(stakePctInput.value) || 20,
  withdrawPct: Number(withdrawPctInput.value) || 25,
  cycles: Number(cyclesInput.value) || 30,
  startDate: startDateInput.value || '2026-05-04',
  rows: []
};

function currency(value) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2
  }).format(value || 0);
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/* --- Streak reset modal helpers --- */
function ensureResetModal() {
  if (document.getElementById('sg-reset-backdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.id = 'sg-reset-backdrop';
  backdrop.className = 'sg-modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'sg-modal';
  modal.innerHTML = `
    <h3>Three consecutive losses</h3>
    <p>You've hit 3 losses in a row. Reset the staking streak to the base stake for your current bankroll?</p>
    <div class="actions">
      <button class="sg-btn ghost" id="sg-reset-cancel">Cancel</button>
      <button class="sg-btn positive" id="sg-reset-confirm">Reset Streak</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  document.getElementById('sg-reset-cancel').addEventListener('click', () => {
    backdrop.classList.remove('show');
    state.resetModalShown = false;
    persistState();
  });

  document.getElementById('sg-reset-confirm').addEventListener('click', () => {
    // Clear only this account's saved state so each account resets independently
    for (const key of getStorageCandidates()) {
      localStorage.removeItem(key);
    }

    // keep current in-memory controls but clear cycles
    state.rows = [];
    state.resetStreak = false;
    state.resetModalShown = false;
    // persist an empty snapshot for the current page so it starts clean
    persistState();
    backdrop.classList.remove('show');
    render();
  });
}

function showResetModal() {
  ensureResetModal();
  const backdrop = document.getElementById('sg-reset-backdrop');
  backdrop.classList.add('show');
}


function buildRows() {
  const rows = [];
  let totalWithdrawals = 0;
  let lastBankroll = Number(state.initialBankroll);
  // prevNextBankroll mirrors the workbook's K column propagation (C6 = K5)
  let prevNextBankroll = '';
  let previousStake = '';
  let consecutiveLosses = 0;
  let currentStreak = 0; // Track the current active streak (not counting resets)

  for (let index = 0; index < Number(state.cycles); index += 1) {
    const rowState = state.rows[index] || { odds: '', result: '' };
    const bankroll = index === 0 ? Number(state.initialBankroll) : (prevNextBankroll === '' ? '' : Number(prevNextBankroll));
    const odds = rowState.odds === '' ? '' : Number(rowState.odds);
    const result = rowState.result || '';
    const resultIsWin = result === 'W';
    const resultIsLoss = result === 'L';
    const resultIsNoBet = result === 'NB';

    let stake = '';
    let returnValue = '';
    let profitLoss = '';
    let withdraw = '';
    let reinvest = '';
    let nextBankroll = '';

    if (resultIsNoBet) {
      // No Bet: skip cycle without staking or affecting streak
      stake = '';
      returnValue = '';
      profitLoss = '';
      withdraw = '';
      reinvest = '';
      nextBankroll = bankroll === '' || Number(bankroll) === 0 ? '' : bankroll;
      consecutiveLosses = 0; // reset streak since no bet was placed
      currentStreak = 0;
    } else if (result === '') {
      // Blank: show calculated stake for reference, no other values
      stake = (bankroll === '' || Number(bankroll) === 0) ? '' : round(Number(bankroll) * (Number(state.stakePct) / 100));
      returnValue = '';
      profitLoss = '';
      withdraw = '';
      reinvest = '';
      nextBankroll = '';
    } else if (resultIsWin) {
      stake = (bankroll === '' || Number(bankroll) === 0) ? '' : round(Number(bankroll) * (Number(state.stakePct) / 100));
      returnValue = odds !== '' ? round(stake * odds) : '';
      profitLoss = returnValue !== '' ? round(returnValue - stake) : '';

      if (profitLoss !== '' && profitLoss > 0) {
        withdraw = round(profitLoss * (Number(state.withdrawPct) / 100));
        reinvest = round(profitLoss * (1 - Number(state.withdrawPct) / 100));
      } else if (profitLoss !== '') {
        withdraw = '';
        reinvest = round(profitLoss);
      }

      if (profitLoss !== '') {
        nextBankroll = bankroll === '' || Number(bankroll) === 0 ? '' : round(Number(bankroll) + reinvest);
      }

      consecutiveLosses = 0;
      currentStreak = 0;
    } else if (resultIsLoss) {
      // compute base stake for this bankroll
      const baseStake = (bankroll === '' || Number(bankroll) === 0) ? '' : round(Number(bankroll) * (Number(state.stakePct) / 100));

      // increment the consecutive loss counter first
      consecutiveLosses += 1;
      currentStreak += 1;

      if (consecutiveLosses === 3) {
        // on the 3rd consecutive loss we use the base stake and then reset the streak
        stake = baseStake;
        returnValue = 0;
        profitLoss = stake !== '' ? round(0 - Number(stake)) : '';
        withdraw = '';
        reinvest = profitLoss;
        nextBankroll = stake !== '' && bankroll !== '' && Number(bankroll) !== 0 ? round(Number(bankroll) + reinvest) : '';

        // show modal once when hitting 3 losses
        if (!state.resetModalShown) {
          state.resetModalShown = true;
          // small timeout to allow render to finish
          setTimeout(() => showResetModal(), 50);
        }

        // reset the internal counter as the workbook logic restarts after the 3rd loss
        consecutiveLosses = 0;
        currentStreak = 0;
      } else {
        // normal loss handling (recalculate stake fresh from current bankroll)
        stake = baseStake;
        returnValue = 0;
        profitLoss = stake !== '' ? round(0 - Number(stake)) : '';
        withdraw = '';
        reinvest = profitLoss;
        nextBankroll = stake !== '' && bankroll !== '' && Number(bankroll) !== 0 ? round(Number(bankroll) + reinvest) : '';
      }
    }

    if (nextBankroll !== '') {
      lastBankroll = nextBankroll;
      totalWithdrawals += withdraw || 0;
    }

    // Propagate K value to next row's C (workbook uses C6 = K5)
    prevNextBankroll = nextBankroll === '' ? '' : nextBankroll;
    previousStake = stake !== '' ? stake : previousStake;

    rows.push({
      date: new Date(state.startDate),
      cycle: index + 1,
      bankroll,
      stake,
      odds: rowState.odds,
      result,
      returnValue,
      profitLoss,
      withdraw,
      reinvest,
      nextBankroll,
      resultClass: result === 'W' ? 'result-win' : (result === 'L' ? 'result-loss' : (result === 'NB' ? 'result-no-bet' : ''))
    });
  }
  // honor a reset request stored in state: clear streak tracking for next render
  if (state.resetStreak) {
    state.resetStreak = false;
    persistState();
  }

  const netWorth = round(lastBankroll + totalWithdrawals);
  return { rows, netWorth, lastBankroll, totalWithdrawals, currentStreak: Math.max(0, consecutiveLosses) };
}

function render() {
  const { rows, netWorth, lastBankroll, totalWithdrawals, currentStreak } = buildRows();
  
  // Calculate stats
  const totalWins = rows.filter(r => r.result === 'W').length;
  const totalLosses = rows.filter(r => r.result === 'L').length;
  const totalBlanks = rows.filter(r => r.result === '').length;
  const totalNoBets = rows.filter(r => r.result === 'NB').length;
  const winRate = (totalWins + totalLosses) > 0 ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1) : 0;
  const winProfits = rows.filter(r => r.result === 'W' && r.profitLoss > 0).map(r => r.profitLoss);
  const avgProfit = winProfits.length > 0 ? round(winProfits.reduce((a, b) => a + b, 0) / winProfits.length) : 0;
  
  // Update streak display
  const streakElement = document.getElementById('currentStreak');
  if (streakElement) {
    streakElement.textContent = `${currentStreak}/3`;
  }
  
  // Update stats card
  const statsWinsEl = document.getElementById('statsWins');
  const statsLossesEl = document.getElementById('statsLosses');
  const statsBlanksEl = document.getElementById('statsBlanks');
  const statsWinRateEl = document.getElementById('statsWinRate');
  const statsAvgProfitEl = document.getElementById('statsAvgProfit');
  
  if (statsWinsEl) statsWinsEl.textContent = totalWins;
  if (statsLossesEl) statsLossesEl.textContent = totalLosses;
  if (statsBlanksEl) statsBlanksEl.textContent = totalBlanks;
  if (statsWinRateEl) statsWinRateEl.textContent = `${winRate}%`;
  if (statsAvgProfitEl) statsAvgProfitEl.textContent = currency(avgProfit);
  
  planBody.innerHTML = rows.map((row, index) => {
    const dateValue = new Date(row.date);
    dateValue.setDate(dateValue.getDate() + index);

    return `
      <tr class="${row.resultClass}">
        <td>${dateValue.toISOString().split('T')[0]}</td>
        <td>${row.cycle}</td>
        <td>${row.bankroll === '' ? '' : currency(row.bankroll)}</td>
        <td>${row.stake === '' ? '' : currency(row.stake)}</td>
        <td>
          <input data-row-index="${index}" data-field="odds" type="number" step="0.01" value="${row.odds}" />
        </td>
        <td>
          <select data-row-index="${index}" data-field="result">
            <option value="" ${row.result === '' ? 'selected' : ''}>—</option>
            <option value="W" ${row.result === 'W' ? 'selected' : ''}>W</option>
            <option value="L" ${row.result === 'L' ? 'selected' : ''}>L</option>
            <option value="NB" ${row.result === 'NB' ? 'selected' : ''}>NB</option>
          </select>
        </td>
        <td>${row.returnValue === '' ? '' : currency(row.returnValue)}</td>
        <td>${row.profitLoss === '' ? '' : currency(row.profitLoss)}</td>
        <td>${row.withdraw === '' ? '' : currency(row.withdraw)}</td>
        <td>${row.reinvest === '' ? '' : currency(row.reinvest)}</td>
        <td>${row.nextBankroll === '' ? '' : currency(row.nextBankroll)}</td>
      </tr>
    `;
  }).join('');

  netWorthValue.textContent = currency(netWorth);
  lastBankrollValue.textContent = currency(lastBankroll);
  totalWithdrawValue.textContent = currency(totalWithdrawals);
}

function applyStateToInputs(nextState) {
  if (typeof nextState.initialBankroll !== 'undefined') {
    initialBankrollInput.value = nextState.initialBankroll;
  }
  if (typeof nextState.stakePct !== 'undefined') {
    stakePctInput.value = nextState.stakePct;
  }
  if (typeof nextState.withdrawPct !== 'undefined') {
    withdrawPctInput.value = nextState.withdrawPct;
  }
  if (typeof nextState.cycles !== 'undefined') {
    cyclesInput.value = nextState.cycles;
  }
  if (typeof nextState.startDate !== 'undefined') {
    startDateInput.value = nextState.startDate;
  }
}

function syncStateFromInputs() {
  state.initialBankroll = Number(initialBankrollInput.value) || 0;
  state.stakePct = Number(stakePctInput.value) || 0;
  state.withdrawPct = Number(withdrawPctInput.value) || 0;
  state.cycles = Number(cyclesInput.value) || 1;
  state.startDate = startDateInput.value;
}

function persistState() {
  const snapshot = {
    initialBankroll: state.initialBankroll,
    stakePct: state.stakePct,
    withdrawPct: state.withdrawPct,
    cycles: state.cycles,
    startDate: state.startDate,
    rows: state.rows
  };

  localStorage.setItem(storageKey, JSON.stringify(snapshot));

  for (const legacyKey of getStorageCandidates().slice(1)) {
    if (legacyKey !== storageKey) {
      localStorage.removeItem(legacyKey);
    }
  }
}

function restoreState() {
  try {
    const candidates = getStorageCandidates();
    let savedValue = null;
    let sourceKey = null;

    for (const candidateKey of candidates) {
      const saved = localStorage.getItem(candidateKey);
      if (saved) {
        savedValue = saved;
        sourceKey = candidateKey;
        break;
      }
    }

    if (!savedValue) return;

    const parsed = JSON.parse(savedValue);
    if (!parsed || typeof parsed !== 'object') return;

    state.initialBankroll = parsed.initialBankroll ?? state.initialBankroll;
    state.stakePct = parsed.stakePct ?? state.stakePct;
    state.withdrawPct = parsed.withdrawPct ?? state.withdrawPct;
    state.cycles = parsed.cycles ?? state.cycles;
    state.startDate = parsed.startDate ?? state.startDate;
    state.rows = Array.isArray(parsed.rows) ? parsed.rows : [];

    applyStateToInputs(state);

    if (sourceKey && sourceKey !== storageKey) {
      persistState();
    }
  } catch (error) {
    console.error('Unable to restore SAFE GROW state', error);
  }
}

function refreshFromControls() {
  syncStateFromInputs();
  persistState();
  render();
}

planBody.addEventListener('input', (event) => {
  const target = event.target;
  if (target.dataset.rowIndex === undefined) return;
  const rowIndex = Number(target.dataset.rowIndex);
  if (!state.rows[rowIndex]) {
    state.rows[rowIndex] = {};
  }
  if (target.dataset.field === 'odds') {
    state.rows[rowIndex].odds = target.value;
  } else if (target.dataset.field === 'result') {
    state.rows[rowIndex].result = target.value;
  }
  persistState();
  render();
});

generateBtn.addEventListener('click', () => {
  // When generating a new plan, clear any existing row context and start fresh
  state.rows = [];
  persistState();
  refreshFromControls();
});
[initialBankrollInput, stakePctInput, withdrawPctInput, cyclesInput, startDateInput].forEach((input) => {
  input.addEventListener('input', refreshFromControls);
  input.addEventListener('change', refreshFromControls);
});

restoreState();
render();
