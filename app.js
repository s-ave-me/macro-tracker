// ==========================
// 1️⃣ Imports / Config
// ==========================
const USDA_API_KEY = "Sejv448bDrxiNZhenVFVxk8TPpAUgAdDeTZNlsbQ";
const USDA_API_SEARCH = "https://api.nal.usda.gov/fdc/v1/foods/search";

// ==========================
// 2️⃣ Helper Functions
// ==========================

// Create element with optional props
function createElement(tag, options = {}) {
  const el = document.createElement(tag);
  Object.assign(el, options); // cleaner way to set props
  return el;
}

// Overlay controls
function showOverlay() {
  foodSearchOverlay.style.display = "flex";
}
function hideOverlay() {
  foodSearchOverlay.style.display = "none";
}

// Local storage persistence
function saveFoodLog() {
  localStorage.setItem("foodLog", JSON.stringify(foodLog));
}
function loadFoodLog() {
  const saved = localStorage.getItem("foodLog");
  if (saved) foodLog = JSON.parse(saved);
  renderFoodLog();
  computeTotals();
}

// Show a temporary inline message
function showOverlayMessage(text, color = "black", autoClear = false) {
  overlayMessage.textContent = text;
  overlayMessage.style.color = color;

  if (autoClear) {
    setTimeout(() => (overlayMessage.textContent = ""), 2000);
  }
}

// ==========================
// 3️⃣ Core Functions
// ==========================
let foodLog = [];
let overlayFood = null;
let editingIndex = null;
let currentFoodResults = [];

async function searchFood(query) {
  overlayFood = null;
  overlayResults.innerHTML = "";

  if (!query.trim()) {
    searchError.textContent = "Please enter a food.";
    searchError.style.color = "red";
    setTimeout(() => (searchError.textContent = ""), 2000);
    return;
  }

  showOverlay();
  showOverlayMessage("Loading...", "blue");

  try {
    const res = await fetch(
      `${USDA_API_SEARCH}?query=${encodeURIComponent(query)}&pageSize=20&api_key=${USDA_API_KEY}`
    );
    if (!res.ok) throw new Error("Network error");

    const data = await res.json();

    // Extract nutrient info
    const results = (data.foods || []).map(food => {
      const nMap = {};
      (food.foodNutrients || []).forEach(n => {
        switch (n.nutrientName) {
          case "Energy": nMap.calories = n.value || 0; break;
          case "Protein": nMap.protein = n.value || 0; break;
          case "Carbohydrate, by difference": nMap.carbs = n.value || 0; break;
          case "Total lipid (fat)": nMap.fat = n.value || 0; break;
        }
      });
      return {
        id: food.fdcId,
        name: food.description,
        calories: nMap.calories || 0,
        protein: nMap.protein || 0,
        carbs: nMap.carbs || 0,
        fat: nMap.fat || 0
      };
    });

    // Remove duplicates by name
    const seen = new Set();
    currentFoodResults = results.filter(f => {
      const name = f.name.toLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });

    if (!currentFoodResults.length) {
      return showOverlayMessage("No results found.", "red");
    }

    showOverlayMessage(""); // clear msg
    renderOverlaySearchResults(currentFoodResults);

  } catch (err) {
    console.error(err);
    showOverlayMessage("Error fetching food data. Try again later.", "red");
  }
}

// Render food search results in overlay
function renderOverlaySearchResults(foodArray) {
  overlayContent.innerHTML = "";
  overlayContent.append(overlayMessage, overlayResults);

  overlayResults.innerHTML = "";
  foodArray.forEach(food => {
    const foodDiv = createElement("div", {
      className: "foodItem",
      textContent: `${food.name} - ${food.calories} kcal per 100g`
    });
    foodDiv.addEventListener("click", () => selectOverlayFood(food));
    overlayResults.appendChild(foodDiv);
  });
}

// Select a food and show macro details
function selectOverlayFood(food) {
  overlayFood = food;
  renderOverlayMacros();
}

// Render macros + actions for selected food
function renderOverlayMacros() {
  overlayContent.innerHTML = "";
  overlayContent.appendChild(overlayMessage);

  if (!overlayFood) {
    showOverlayMessage("Please select a food from the search results above.", "#555");
    overlayContent.appendChild(overlayResults);
    return;
  }

  showOverlayMessage(""); // clear msg

  const title = createElement("h3", { textContent: overlayFood.name });
  const info = [
    `Calories: ${overlayFood.calories} kcal`,
    `Protein: ${overlayFood.protein} g`,
    `Carbs: ${overlayFood.carbs} g`,
    `Fat: ${overlayFood.fat} g`
  ].map(t => createElement("p", { textContent: t }));

  const servingInput = createElement("input", { type: "number", value: overlayFood.servingSize || 100 });
  const servingLabel = createElement("label", { textContent: "Serving size (g): " });
  servingLabel.appendChild(servingInput);

  const btnSave = createElement("button", {
    textContent: editingIndex !== null ? "Save Changes" : "Add to Log",
    className: "btn btnAdd"
  });
  btnSave.addEventListener("click", () => {
    const servingSize = parseFloat(servingInput.value);
    if (isNaN(servingSize) || servingSize <= 0) {
      return showOverlayMessage("Invalid serving size.", "red", true);
    }

    const scaledFood = {
      ...overlayFood,
      servingSize,
      calories: (overlayFood.calories * servingSize / 100).toFixed(1),
      protein: (overlayFood.protein * servingSize / 100).toFixed(1),
      carbs: (overlayFood.carbs * servingSize / 100).toFixed(1),
      fat: (overlayFood.fat * servingSize / 100).toFixed(1)
    };

    if (editingIndex !== null) {
      foodLog[editingIndex] = scaledFood;
      const wasEditing = editingIndex;
      editingIndex = null;
      overlayFood = null;
      renderFoodLog();
      computeTotals();
      saveFoodLog();
      hideOverlay();
      // Restore temporarily for animation
      editingIndex = wasEditing;
      renderFoodLog();
      editingIndex = null;
    } else {
      foodLog.push(scaledFood);
      overlayFood = null;
      renderFoodLog();
      computeTotals();
      saveFoodLog();
      hideOverlay();
    }
  });

  const btnClose = createElement("button", { textContent: "Close", className: "btn" });
  btnClose.addEventListener("click", hideOverlay);

  overlayContent.append(title, ...info, servingLabel, btnSave, btnClose);
}

// Render food log table
function renderFoodLog() {
  foodLogTableBody.innerHTML = "";

  foodLog.forEach((food, index) => {
    const row = createElement("tr");
    
    // Add animation class only to the row that was just edited
    if (index === editingIndex) {
      row.classList.add('row-updated');
      setTimeout(() => row.classList.remove('row-updated'), 500);
    }
    
    const nameCell = createElement("td", { textContent: food.name });
    const servingCell = createElement("td", { textContent: food.servingSize + " g" });
    const caloriesCell = createElement("td", { textContent: food.calories });

    const btnEdit = createElement("button", { textContent: "Edit", className: "btn btnEdit" });
    btnEdit.addEventListener("click", () => {
      editingIndex = index;
      overlayFood = food;
      showOverlay();
      renderOverlayMacros();
    });

    const btnDelete = createElement("button", { textContent: "Delete", className: "btn btnDelete" });
    btnDelete.addEventListener("click", () => {
      foodLog.splice(index, 1);
      renderFoodLog();
      computeTotals();
      saveFoodLog();
    });

    const actionsCell = createElement("td");
    actionsCell.append(btnEdit, btnDelete);

    row.append(nameCell, servingCell, caloriesCell, actionsCell);
    foodLogTableBody.appendChild(row);
  });
}

// Compute totals from log
function computeTotals() {
  const totals = foodLog.reduce(
    (acc, f) => {
      acc.calories += parseFloat(f.calories);
      acc.protein += parseFloat(f.protein);
      acc.carbs += parseFloat(f.carbs);
      acc.fat += parseFloat(f.fat);
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  totalCalories.textContent = totals.calories.toFixed(1);
  totalProtein.textContent = totals.protein.toFixed(1);
  totalNetCarbs.textContent = totals.carbs.toFixed(1);
  totalFat.textContent = totals.fat.toFixed(1);
}

// ==========================
// 4️⃣ DOM Elements
// ==========================
const inputFoodSearch = document.getElementById("inputFoodSearch");
const searchError = document.getElementById("searchError");
const btnFoodSearch = document.getElementById("btnFoodSearch");
const foodSearchOverlay = document.getElementById("foodSearchOverlay");
const overlayContent = document.getElementById("overlayContent");
const overlayMessage = createElement("p", { id: "overlayMessage" });
const overlayResults = createElement("div", { id: "overlayResults" });
const foodLogTableBody = document.querySelector("#foodLogTable tbody");

const totalCalories = document.getElementById("totalCalories");
const totalProtein = document.getElementById("totalProtein");
const totalNetCarbs = document.getElementById("totalNetCarbs");
const totalFat = document.getElementById("totalFat");

// ==========================
// 5️⃣ Event Listeners
// ==========================
btnFoodSearch.addEventListener("click", () => searchFood(inputFoodSearch.value));
inputFoodSearch.addEventListener("keypress", e => {
  if (e.key === "Enter") searchFood(inputFoodSearch.value);
});
foodSearchOverlay.addEventListener("click", e => {
  if (e.target === foodSearchOverlay) hideOverlay();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") hideOverlay();
});

// ==========================
// 6️⃣ Init / Entry Point
// ==========================
function init() {
  loadFoodLog();
  console.log("Mini Cronometer Tracker initialized.");
}
init();