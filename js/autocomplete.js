// Autocomplete module - handles autocomplete suggestions
import { unionStart } from './utils.js';

export function suggestAutocomplete(sourceMap, inputText, excludeList = []) {
  let unionCount = 0;
  let weight = 0;
  let suggestion = null;

  inputText = inputText.trim().toLowerCase();
  sourceMap.forEach((v, k) => {
    if (!excludeList.includes(k)) {
      const lower = k.toLowerCase();
      const count = unionStart(inputText, lower);
      if (count > unionCount || (count === unionCount && v > weight)) {
        suggestion = k;
        weight = v;
        unionCount = count;
      }
    }
  });

  return suggestion;
}

export function applySuggestion(input, div, suggestion) {
  input.value = suggestion;
  div.style.display = "none";
}

export function setupAutocomplete(input, suggestionDiv, sourceMap, getSuggestion, excludeList = []) {
  suggestionDiv.addEventListener("click", () =>
    applySuggestion(input, suggestionDiv, getSuggestion())
  );

  input.addEventListener("input", (event) => {
    const value = event.target.value;
    const suggested = suggestAutocomplete(sourceMap, value, excludeList);

    if (!suggested) {
      suggestionDiv.style.display = "none";
      return;
    }

    suggestionDiv.textContent = suggested;
    suggestionDiv.style.display = "block";

    if (value.endsWith("  ")) {
      applySuggestion(input, suggestionDiv, suggested);
    }
  });
}