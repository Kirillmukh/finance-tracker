import { suggestAutocomplete, applySuggestion } from './autocomplete.js';

export function setupRenameTagUI(transactionManager, allTags) {
  const renameFromInput = document.getElementById('rename-tag-from');
  const renameFromSuggestion = document.getElementById('rename-tag-from-suggestion');
  const renameToInput = document.getElementById('rename-tag-to');
  const renameTagStats = document.getElementById('rename-tag-stats');
  const renameTagWarning = document.getElementById('rename-tag-warning');
  const renameTagStatus = document.getElementById('rename-tag-status');

  const updateStats = (value) => {
    const trimmed = value.trim();
    if (allTags.has(trimmed)) {
      transactionManager.getTagStats(trimmed, (count, total) => {
        renameTagStats.textContent = `${count} транзакций • сумма: ${total} ₽`;
        renameTagStats.style.display = 'block';
      });
    } else {
      renameTagStats.style.display = 'none';
    }
  };

  let suggestedRenameTag = '';
  renameFromSuggestion.addEventListener('click', () => {
    applySuggestion(renameFromInput, renameFromSuggestion, suggestedRenameTag);
    updateStats(suggestedRenameTag);
  });

  renameFromInput.addEventListener('input', (event) => {
    const value = event.target.value;
    suggestedRenameTag = suggestAutocomplete(allTags, value);

    if (!suggestedRenameTag) {
      renameFromSuggestion.style.display = 'none';
    } else {
      renameFromSuggestion.textContent = suggestedRenameTag;
      renameFromSuggestion.style.display = 'block';
      if (value.endsWith('  ')) {
        applySuggestion(renameFromInput, renameFromSuggestion, suggestedRenameTag);
        updateStats(suggestedRenameTag);
        return;
      }
    }

    updateStats(value);
  });

  renameToInput.addEventListener('input', (event) => {
    const toVal = event.target.value;
    const fromVal = renameFromInput.value.trim();
    if (toVal && allTags.has(toVal) && toVal !== fromVal) {
      renameTagWarning.textContent = `Тег "${toVal}" уже существует — транзакции будут объединены`;
      renameTagWarning.style.display = 'block';
    } else {
      renameTagWarning.style.display = 'none';
    }
  });

  document.getElementById('rename-tag-btn').addEventListener('click', () => {
    const oldTag = renameFromInput.value.trim();
    const newTag = renameToInput.value;

    if (!oldTag || !newTag) {
      renameTagStatus.textContent = 'Заполните оба поля';
      setTimeout(() => { renameTagStatus.textContent = ''; }, 2000);
      return;
    }
    if (!allTags.has(oldTag)) {
      renameTagStatus.textContent = `Тег "${oldTag}" не найден`;
      setTimeout(() => { renameTagStatus.textContent = ''; }, 2000);
      return;
    }

    transactionManager.renameTag(oldTag, newTag, () => {
      renameFromInput.value = '';
      renameToInput.value = '';
      renameTagStats.style.display = 'none';
      renameTagWarning.style.display = 'none';
      renameFromSuggestion.style.display = 'none';
      renameTagStatus.textContent = `Тег "${oldTag}" переименован в "${newTag}"`;
      setTimeout(() => { renameTagStatus.textContent = ''; }, 3000);
    });
  });
}
