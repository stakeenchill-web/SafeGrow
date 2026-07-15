const accountConfigs = [
  { id: 'sg', label: 'SG', href: 'SG.html' },
  { id: 'sg2', label: 'SG2', href: 'SG2.html' },
  { id: 'sg3', label: 'SG3', href: 'SG3.html' }
];

function getStorageCandidates(accountId) {
  const normalized = accountId.toLowerCase();
  return [
    `safe-grow-state-${normalized}`,
    `safe-grow-state-${accountId.toUpperCase()}`
  ];
}

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

function loadSavedState(accountId) {
  const keys = getStorageCandidates(accountId);

  for (const storageKey of keys) {
    try {
      const value = localStorage.getItem(storageKey);
      if (!value) {
        continue;
      }

      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

      return parsed;
    } catch (error) {
      console.error('Unable to load dashboard state', error);
    }
  }

  return null;
}

function computeSummary(state) {
  const initialBankroll = Number(state?.initialBankroll) || 0;
  const stakePct = Number(state?.stakePct) || 0;
  const withdrawPct = Number(state?.withdrawPct) || 0;
  const cycles = Number(state?.cycles) || 1;
  const rows = Array.isArray(state?.rows) ? state.rows : [];
  let totalWithdrawals = 0;
  let lastBankroll = initialBankroll;
  let prevNextBankroll = '';
  let previousStake = '';
  let consecutiveLosses = 0;

  for (let index = 0; index < cycles; index += 1) {
    const rowState = rows[index] || { odds: '', result: '' };
    const bankroll = index === 0 ? initialBankroll : (prevNextBankroll === '' ? '' : Number(prevNextBankroll));
    const odds = rowState.odds === '' ? '' : Number(rowState.odds);
    const result = rowState.result || '';
    const resultIsWin = result === 'W';
    const resultIsLoss = result === 'L';

    let stake = '';
    let profitLoss = '';
    let withdraw = '';
    let reinvest = '';
    let nextBankroll = '';

    if (result === '') {
      stake = previousStake !== '' ? previousStake : (bankroll === '' || Number(bankroll) === 0 ? '' : round(Number(bankroll) * (stakePct / 100)));
      nextBankroll = bankroll === '' || Number(bankroll) === 0 ? '' : round(Number(bankroll));
    } else if (resultIsWin) {
      stake = (bankroll === '' || Number(bankroll) === 0) ? '' : round(Number(bankroll) * (stakePct / 100));
      const returnValue = odds !== '' ? round(stake * odds) : '';
      profitLoss = returnValue !== '' ? round(returnValue - stake) : '';

      if (profitLoss !== '' && profitLoss > 0) {
        withdraw = round(profitLoss * (withdrawPct / 100));
        reinvest = round(profitLoss * (1 - withdrawPct / 100));
      } else if (profitLoss !== '') {
        withdraw = '';
        reinvest = round(profitLoss);
      }

      if (profitLoss !== '') {
        nextBankroll = bankroll === '' || Number(bankroll) === 0 ? '' : round(Number(bankroll) + reinvest);
      }

      consecutiveLosses = 0;
    } else if (resultIsLoss) {
      stake = previousStake !== '' ? previousStake : (bankroll === '' || Number(bankroll) === 0 ? '' : round(Number(bankroll) * (stakePct / 100)));
      if (consecutiveLosses === 2) {
        stake = (bankroll === '' || Number(bankroll) === 0) ? '' : round(Number(bankroll) * (stakePct / 100));
        consecutiveLosses = 0;
      }

      profitLoss = stake !== '' ? round(0 - Number(stake)) : '';
      withdraw = '';
      reinvest = profitLoss;
      nextBankroll = stake !== '' && bankroll !== '' && Number(bankroll) !== 0 ? round(Number(bankroll) + reinvest) : '';

      consecutiveLosses += 1;
    }

    if (nextBankroll !== '') {
      lastBankroll = nextBankroll;
      totalWithdrawals += withdraw || 0;
    }

    prevNextBankroll = nextBankroll === '' ? '' : nextBankroll;
    previousStake = stake !== '' ? stake : previousStake;
  }

  return {
    initialBankroll,
    lastBankroll,
    totalWithdrawals,
    netWorth: round(lastBankroll + totalWithdrawals),
    cycleCount: cycles,
    hasData: rows.some((row) => row && (row.odds || row.result))
  };
}

function renderDashboard() {
  const totalNetWorthElement = document.getElementById('totalNetWorth');
  const totalWithdrawalsElement = document.getElementById('totalWithdrawals');
  const activeAccountsElement = document.getElementById('activeAccounts');
  const bestAccountElement = document.getElementById('bestAccount');
  const accountListElement = document.getElementById('accountList');

  if (!totalNetWorthElement || !accountListElement) {
    return;
  }

  const summaries = accountConfigs.map((account) => {
    const state = loadSavedState(account.id);
    const summary = computeSummary(state);
    return {
      ...account,
      ...summary,
      status: summary.lastBankroll >= summary.initialBankroll ? 'Healthy' : 'Needs review'
    };
  });

  const totalNetWorth = summaries.reduce((sum, account) => sum + account.netWorth, 0);
  const totalWithdrawals = summaries.reduce((sum, account) => sum + account.totalWithdrawals, 0);
  const activeAccounts = summaries.filter((account) => account.hasData).length;
  const bestAccount = summaries.reduce((best, account) => {
    if (!best) return account;
    return account.netWorth > best.netWorth ? account : best;
  }, null);

  totalNetWorthElement.textContent = currency(totalNetWorth);
  totalWithdrawalsElement.textContent = currency(totalWithdrawals);
  activeAccountsElement.textContent = `${activeAccounts}/${accountConfigs.length}`;
  bestAccountElement.textContent = bestAccount ? `${bestAccount.label} · ${currency(bestAccount.netWorth)}` : 'No account data yet';

  accountListElement.innerHTML = summaries.map((account) => `
    <div class="account-item">
      <div>
        <strong>${account.label}</strong>
        <div class="account-meta">Net worth: ${currency(account.netWorth)} · Last bankroll: ${currency(account.lastBankroll)}</div>
      </div>
      <div class="account-right">
        <span class="status-pill">${account.status}</span>
        <a class="account-link" href="${account.href}">Open</a>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', renderDashboard);
window.addEventListener('storage', renderDashboard);
window.addEventListener('focus', renderDashboard);
