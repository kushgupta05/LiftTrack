"use strict";

// LiftTrack stores each feature separately so the data is easy to understand and maintain.
const KEYS = { current: "lifttrack_current_workout", history: "lifttrack_workout_history", foods: "lifttrack_foods", plans: "lifttrack_plans", favourites: "lifttrack_favourites" };
const PROTEIN_GOAL = 160;
// Replace only these two placeholders with values from Supabase > Project Settings > API.
const SUPABASE_URL = "https://wpyqizlgspolfnffpily.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6_skE_QXKO7BA8TuxoFgaw_7k9x18pw";
const supabaseClient = SUPABASE_URL !== "SUPABASE_URL" && SUPABASE_PUBLISHABLE_KEY !== "SUPABASE_PUBLISHABLE_KEY"
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;
const exercises = ["Back Squat", "Bench Press", "Deadlift", "Overhead Press", "Barbell Row", "Pull-Up", "Lat Pulldown", "Leg Press", "Romanian Deadlift", "Dumbbell Curl", "Triceps Pushdown"];
const formGuides = {
  "Back Squat": { setup: ["Set the bar across your upper back.", "Stand about shoulder-width with toes slightly out.", "Brace your trunk before unracking."], execution: ["Sit down between your hips.", "Keep your whole foot connected to the floor.", "Drive up while knees track over toes."], mistakes: ["Heels lifting off the floor.", "Knees collapsing inward.", "Losing your brace at the bottom."] },
  "Bench Press": { setup: ["Plant your feet firmly.", "Pin your shoulder blades back and down.", "Grip just outside shoulder width."], execution: ["Lower the bar to the lower chest.", "Keep forearms vertical at the bottom.", "Press up and slightly back."], mistakes: ["Shoulders rolling forward.", "Bouncing the bar off the chest.", "Lifting hips from the bench."] },
  "Deadlift": { setup: ["Place mid-foot under the bar.", "Grip just outside your legs.", "Brace with a neutral spine."], execution: ["Push the floor away.", "Keep the bar close to your legs.", "Finish tall without leaning back."], mistakes: ["Bar drifting forward.", "Jerking the bar from the floor.", "Overextending at lockout."] },
  "Overhead Press": { setup: ["Grip slightly wider than shoulders.", "Stack wrists over elbows.", "Brace glutes and trunk."], execution: ["Move your head back as the bar rises.", "Press in a nearly straight line.", "Finish with arms beside ears."], mistakes: ["Excessive lower-back arch.", "Pressing around the face.", "Flared wrists."] }
};
const defaultGuide = { setup: ["Choose a stable stance.", "Set the joints in a comfortable position.", "Brace before starting each rep."], execution: ["Use a controlled range of motion.", "Keep tension on the target muscles.", "Breathe and repeat consistently."], mistakes: ["Using momentum instead of control.", "Rushing the lowering phase.", "Loading beyond your current technique."] };

let currentWorkout = load(KEYS.current, { startedAt: null, planName: "", plannedExercises: [], sets: [] });
const localWorkoutHistory = load(KEYS.history, []);
let workoutHistory = localWorkoutHistory;
let authenticatedUser = null;
let foods = load(KEYS.foods, []).filter(item => item.date === dateKey());
let plans = load(KEYS.plans, []);
let favourites = load(KEYS.favourites, []);
let editingPlanId = null;
let confirmAction = null;

function load(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } }
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function dateKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function epley(weight, reps) { return weight * (1 + reps / 30); }
function formatNumber(number) { return Math.round(number).toLocaleString(); }
function escapeHTML(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function formatDate(value) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }

function showToast(message, type = "success") { const toast = document.createElement("div"); toast.className = `toast ${type}`; toast.textContent = message; document.querySelector("#toastContainer").append(toast); setTimeout(() => toast.remove(), 3000); }
function hasSupabaseConfig() { return SUPABASE_URL !== "SUPABASE_URL" && SUPABASE_PUBLISHABLE_KEY !== "SUPABASE_PUBLISHABLE_KEY"; }
function requireSupabaseConfig() { if (hasSupabaseConfig()) return true; showToast("Add your Supabase Project URL and publishable key in script.js first.", "error"); return false; }

function ensureWorkoutLoggerAvailable() {
  const workoutView = document.querySelector("#workoutView");
  workoutView.classList.remove("hidden");
  workoutView.removeAttribute("aria-hidden");
  workoutView.style.removeProperty("display");
  ["exerciseSelect", "weightInput", "repsInput", "addSet", "finishWorkout"].forEach(id => {
    document.querySelector(`#${id}`).disabled = false;
  });
}

function renderHistoryViews() {
  renderDashboard();
  renderWorkout();
  renderAnalytics();
}

function updateAuthUI(user) {
  authenticatedUser = user;
  document.querySelector("#authStatus").textContent = user ? `Signed in: ${user.email || user.id}` : "Not signed in";
  document.querySelector("#authStatus").classList.toggle("live", !!user);
  document.querySelector("#signOut").disabled = !user;
  ensureWorkoutLoggerAvailable();
  if (user) {
    workoutHistory = localWorkoutHistory;
    renderHistoryViews();
    loadSupabaseWorkoutHistory();
  }
  else {
    workoutHistory = localWorkoutHistory;
    renderHistoryViews();
  }
}

async function signUp() {
  if (!requireSupabaseConfig()) return;
  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;
  if (!email || !password) return showToast("Enter an email and password.", "error");
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return showToast(error.message, "error");
  showToast(data.session ? "Account created and signed in." : "Account created. Check your email to confirm it, then sign in.");
}

async function signIn() {
  if (!requireSupabaseConfig()) return;
  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;
  if (!email || !password) return showToast("Enter an email and password.", "error");
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return showToast(error.message, "error");
  document.querySelector("#authPassword").value = "";
  showToast("Signed in successfully.");
}

async function signOut() {
  if (!requireSupabaseConfig()) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) return showToast(error.message, "error");
  showToast("Signed out.");
}

async function loadSupabaseWorkoutHistory({ quiet = false } = {}) {
  if (!authenticatedUser || !requireSupabaseConfig()) return false;
  // There is intentionally no user_id filter; RLS on both tables enforces ownership.
  const { data: sessions, error: sessionsError } = await supabaseClient.from("workout_sessions").select("id, name, completed_at, total_volume").order("completed_at", { ascending: false });
  if (sessionsError) {
    if (!quiet) showToast(`Could not load workout history: ${sessionsError.message}`, "error");
    return false;
  }
  let sets = [];
  if (sessions.length) {
    const { data: setRows, error: setsError } = await supabaseClient.from("workout_sets").select("id, workout_id, exercise, weight, reps, created_at");
    if (setsError) {
      if (!quiet) showToast(`Could not load workout sets: ${setsError.message}`, "error");
      return false;
    }
    sets = setRows;
  }
  const setsByWorkout = new Map();
  sets.forEach(set => {
    if (!setsByWorkout.has(set.workout_id)) setsByWorkout.set(set.workout_id, []);
    setsByWorkout.get(set.workout_id).push({ id: set.id, exercise: set.exercise, weight: Number(set.weight), reps: Number(set.reps), createdAt: set.created_at });
  });
  workoutHistory = sessions.map(session => ({ id: session.id, name: session.name || "Workout", startedAt: session.completed_at, finishedAt: session.completed_at, totalVolume: Number(session.total_volume), source: "supabase", sets: setsByWorkout.get(session.id) || [] }));
  renderHistoryViews();
  return true;
}

function initializeSupabase() {
  if (!hasSupabaseConfig()) return updateAuthUI(null);
  supabaseClient.auth.getSession().then(({ data }) => updateAuthUI(data.session?.user ?? null));
  supabaseClient.auth.onAuthStateChange((_event, session) => updateAuthUI(session?.user ?? null));
}
function askConfirmation(message, action, label = "Delete") { confirmAction = action; document.querySelector("#confirmMessage").textContent = message; document.querySelector("#confirmOkay").textContent = label; document.querySelector("#confirmModal").classList.add("open"); document.querySelector("#confirmModal").setAttribute("aria-hidden", "false"); }
function closeConfirmation() { confirmAction = null; document.querySelector("#confirmModal").classList.remove("open"); document.querySelector("#confirmModal").setAttribute("aria-hidden", "true"); }

function showView(name) { if (name === "workout") ensureWorkoutLoggerAvailable(); document.querySelectorAll(".view").forEach(view => view.classList.remove("active")); document.querySelector(`#${name}View`).classList.add("active"); document.querySelectorAll(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === name)); document.querySelector("#pageTitle").textContent = ({ dashboard: "Dashboard", workout: "Workout logger", nutrition: "Nutrition", plans: "Workout plans", analytics: "Analytics", guide: "Form guide" })[name]; document.querySelector(".sidebar").classList.remove("open"); window.scrollTo({ top: 0, behavior: "smooth" }); if (name === "analytics") renderAnalytics(); }

function initializeSelectors() { const options = exercises.map(name => `<option>${name}</option>`).join(""); document.querySelector("#exerciseSelect").innerHTML = options; document.querySelector("#guideExercise").innerHTML = options; }
function renderAll() { renderDashboard(); renderWorkout(); renderNutrition(); renderPlans(); renderFavourites(); renderAnalytics(); renderGuide(); }

function renderDashboard() {
  const hour = new Date().getHours(); document.querySelector("#greeting").textContent = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}.`;
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
  const setCount = currentWorkout.sets.length; document.querySelector("#dashWorkoutStatus").textContent = setCount ? "In progress" : "Not started"; document.querySelector("#dashWorkoutDetail").textContent = setCount ? `${setCount} set${setCount === 1 ? "" : "s"} logged` : "Ready for your next session";
  const protein = foods.reduce((sum, food) => sum + food.protein * food.quantity, 0); document.querySelector("#dashProtein").textContent = formatNumber(protein); document.querySelector("#dashProteinBar").style.width = `${Math.min(protein / PROTEIN_GOAL * 100, 100)}%`;
  const allSets = workoutHistory.flatMap(workout => workout.sets); const best = allSets.sort((a, b) => epley(b.weight, b.reps) - epley(a.weight, a.reps))[0]; document.querySelector("#dashBest1rm").textContent = best ? `${formatNumber(epley(best.weight, best.reps))} kg` : "—"; document.querySelector("#dashBestExercise").textContent = best ? best.exercise : "Log sets to establish a best";
  const last = workoutHistory[0]; document.querySelector("#lastWorkout").innerHTML = last ? `<div class="history-card"><div><strong>${escapeHTML(last.name || "Workout")}</strong><small>${formatDate(last.finishedAt)}</small></div><div><strong>${last.sets.length}</strong><small>sets</small></div><div><strong>${formatNumber(workoutVolume(last))} kg</strong><small>volume</small></div><div><strong>${new Set(last.sets.map(set => set.exercise)).size}</strong><small>exercises</small></div></div>` : "No completed workouts yet. Your first session will appear here.";
}

function startWorkout(plan = null) { if (!currentWorkout.startedAt) currentWorkout.startedAt = new Date().toISOString(); if (plan) { currentWorkout.planName = plan.name; currentWorkout.plannedExercises = plan.exercises; const firstAvailable = plan.exercises.find(item => exercises.includes(item)); if (firstAvailable) document.querySelector("#exerciseSelect").value = firstAvailable; } save(KEYS.current, currentWorkout); renderWorkout(); showView("workout"); showToast(plan ? `${plan.name} started` : "Workout ready"); }
function addSet() { const exercise = document.querySelector("#exerciseSelect").value; const weight = Number(document.querySelector("#weightInput").value); const reps = Number(document.querySelector("#repsInput").value); if (!weight || weight <= 0 || !Number.isInteger(reps) || reps <= 0) return showToast("Enter a valid weight and whole-number reps.", "error"); if (!currentWorkout.startedAt) currentWorkout.startedAt = new Date().toISOString(); currentWorkout.sets.push({ id: uid(), exercise, weight, reps, createdAt: new Date().toISOString() }); save(KEYS.current, currentWorkout); document.querySelector("#repsInput").value = ""; renderWorkout(); renderDashboard(); showToast(`${exercise} set added`); }
function deleteSet(id) { currentWorkout.sets = currentWorkout.sets.filter(set => set.id !== id); if (!currentWorkout.sets.length) currentWorkout.startedAt = null; save(KEYS.current, currentWorkout); renderWorkout(); renderDashboard(); showToast("Set removed"); }
function volumeOf(sets) { return sets.reduce((sum, set) => sum + set.weight * set.reps, 0); }
function workoutVolume(workout) { return Number.isFinite(workout.totalVolume) ? workout.totalVolume : volumeOf(workout.sets); }
function clearCurrentWorkout() {
  currentWorkout = { startedAt: null, planName: "", plannedExercises: [], sets: [] };
  save(KEYS.current, currentWorkout);
}

async function finishAuthenticatedWorkout() {
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    showToast(userError?.message || "Your session expired. Sign in again before finishing.", "error");
    return;
  }
  const completedAt = new Date().toISOString();
  const sessionPayload = { user_id: user.id, name: currentWorkout.planName || "Workout", completed_at: completedAt, total_volume: volumeOf(currentWorkout.sets) };
  const { data: session, error: sessionError } = await supabaseClient.from("workout_sessions").insert(sessionPayload).select("id").single();
  if (sessionError) {
    closeConfirmation();
    showToast(`Workout session was not saved: ${sessionError.message}`, "error");
    return;
  }
  const setRows = currentWorkout.sets.map(set => ({ workout_id: session.id, user_id: user.id, exercise: set.exercise, weight: set.weight, reps: set.reps }));
  const { error: setsError } = await supabaseClient.from("workout_sets").insert(setRows);
  if (setsError) {
    const { error: cleanupError } = await supabaseClient.from("workout_sessions").delete().eq("id", session.id);
    closeConfirmation();
    const cleanupMessage = cleanupError ? ` Cleanup also failed: ${cleanupError.message}` : " The incomplete session was removed.";
    showToast(`Workout sets were not saved: ${setsError.message}.${cleanupMessage}`, "error");
    return;
  }
  clearCurrentWorkout();
  closeConfirmation();
  const refreshed = await loadSupabaseWorkoutHistory({ quiet: true });
  if (!refreshed) renderAll();
  showToast(refreshed ? "Workout saved to Supabase." : "Workout saved, but history could not be refreshed.", refreshed ? "success" : "error");
}

async function deleteSupabaseWorkout(id) {
  const { error } = await supabaseClient.from("workout_sessions").delete().eq("id", id);
  if (error) {
    closeConfirmation();
    return showToast(`Workout could not be deleted: ${error.message}`, "error");
  }
  closeConfirmation();
  const refreshed = await loadSupabaseWorkoutHistory({ quiet: true });
  if (!refreshed) workoutHistory = workoutHistory.filter(workout => workout.id !== id);
  renderAll();
  showToast(refreshed ? "Workout deleted." : "Workout deleted, but history could not be refreshed.", refreshed ? "success" : "error");
}

function requestWorkoutDeletion(id) {
  const workout = workoutHistory.find(item => item.id === id);
  if (!workout) return;
  askConfirmation("Delete this completed workout and remove it from analytics?", async () => {
    if (workout.source === "supabase") return deleteSupabaseWorkout(id);
    const index = localWorkoutHistory.findIndex(item => item.id === id);
    if (index >= 0) localWorkoutHistory.splice(index, 1);
    workoutHistory = localWorkoutHistory;
    save(KEYS.history, localWorkoutHistory);
    closeConfirmation();
    renderAll();
    showToast("Workout deleted");
  });
}

function finishWorkout() {
  if (!currentWorkout.sets.length) return showToast("Add at least one set before finishing.", "error");
  askConfirmation("Finish and save this workout to your history?", async () => {
    if (authenticatedUser && hasSupabaseConfig()) return finishAuthenticatedWorkout();
    const completedWorkout = { id: uid(), name: currentWorkout.planName || "Free workout", startedAt: currentWorkout.startedAt, finishedAt: new Date().toISOString(), sets: currentWorkout.sets };
    localWorkoutHistory.unshift(completedWorkout);
    workoutHistory = localWorkoutHistory;
    save(KEYS.history, localWorkoutHistory);
    clearCurrentWorkout();
    closeConfirmation();
    renderAll();
    showToast("Workout finished — strong work!");
  }, "Finish");
}
function renderWorkout() { const sets = currentWorkout.sets; document.querySelector("#workoutHeading").textContent = currentWorkout.planName || "Today’s workout"; document.querySelector("#workoutStarted").textContent = currentWorkout.startedAt ? `Started ${new Date(currentWorkout.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Add your first working set to begin."; document.querySelector("#currentSets").textContent = sets.length; document.querySelector("#currentVolume").textContent = `${formatNumber(volumeOf(sets))} kg`; const best = Math.max(0, ...sets.map(set => epley(set.weight, set.reps))); document.querySelector("#current1rm").textContent = best ? `${formatNumber(best)} kg` : "—"; document.querySelector("#sessionPill").textContent = sets.length ? "In progress" : "Waiting"; document.querySelector("#sessionPill").classList.toggle("live", !!sets.length); const list = document.querySelector("#currentSetList"); list.classList.toggle("empty-state", !sets.length); list.innerHTML = sets.length ? sets.map((set, index) => `<div class="set-row"><span class="set-number">${index + 1}</span><div><strong>${escapeHTML(set.exercise)}</strong><small>Exercise</small></div><div><strong>${set.weight} kg</strong><small>Weight</small></div><div><strong>${set.reps}</strong><small>Reps</small></div><div><strong>${formatNumber(epley(set.weight, set.reps))} kg</strong><small>Est. 1RM</small></div><button class="icon-btn" data-delete-set="${set.id}" aria-label="Delete set">×</button></div>`).join("") : "No sets logged yet."; const history = document.querySelector("#historyList"); history.classList.toggle("empty-state", !workoutHistory.length); history.innerHTML = workoutHistory.length ? workoutHistory.map(workout => `<div class="history-card"><div><strong>${escapeHTML(workout.name)}</strong><small>${formatDate(workout.finishedAt)}</small></div><div><strong>${workout.sets.length}</strong><small>sets</small></div><div><strong>${formatNumber(workoutVolume(workout))} kg</strong><small>volume</small></div><div><strong>${new Set(workout.sets.map(set => set.exercise)).size}</strong><small>exercises</small></div><button class="icon-btn" data-delete-workout="${workout.id}" aria-label="Delete workout">×</button></div>`).join("") : "Completed workouts will be saved here."; }

function addFood() { const name = document.querySelector("#foodName").value.trim(); const protein = Number(document.querySelector("#foodProtein").value); const quantity = Number(document.querySelector("#foodQuantity").value); if (!name || protein <= 0 || quantity <= 0) return showToast("Complete all food fields with positive values.", "error"); foods.push({ id: uid(), name, protein, quantity, date: dateKey() }); save(KEYS.foods, foods); document.querySelector("#foodName").value = ""; document.querySelector("#foodProtein").value = ""; document.querySelector("#foodQuantity").value = "1"; renderNutrition(); renderDashboard(); showToast("Food added"); }
function renderNutrition() { const total = foods.reduce((sum, food) => sum + food.protein * food.quantity, 0); const percent = Math.min(total / PROTEIN_GOAL * 100, 100); document.querySelector("#proteinTotal").textContent = `${formatNumber(total)}g`; document.querySelector("#proteinRing").style.setProperty("--protein", `${percent * 3.6}deg`); document.querySelector("#proteinMessage").textContent = total >= PROTEIN_GOAL ? "Goal reached. Recovery is covered." : `${formatNumber(PROTEIN_GOAL - total)}g remaining today.`; document.querySelector("#foodCount").textContent = `${foods.length} item${foods.length === 1 ? "" : "s"}`; const list = document.querySelector("#foodList"); list.classList.toggle("empty-state", !foods.length); list.innerHTML = foods.length ? foods.map(food => `<div class="food-row"><div><strong>${escapeHTML(food.name)}</strong><small>${food.protein}g per serving</small></div><div><strong>${food.quantity}</strong><small>quantity</small></div><div><strong>${formatNumber(food.protein * food.quantity)}g</strong><small>protein</small></div><button class="icon-btn" data-delete-food="${food.id}" aria-label="Delete food">×</button></div>`).join("") : "No foods logged today."; }

function savePlan() { const name = document.querySelector("#planName").value.trim(); const planExercises = document.querySelector("#planExercises").value.split("\n").map(item => item.trim()).filter(Boolean); if (!name || !planExercises.length) return showToast("Add a plan name and at least one exercise.", "error"); if (editingPlanId) { const plan = plans.find(item => item.id === editingPlanId); plan.name = name; plan.exercises = planExercises; showToast("Plan updated"); } else { plans.push({ id: uid(), name, exercises: planExercises }); showToast("Plan created"); } save(KEYS.plans, plans); cancelPlanEdit(); renderPlans(); }
function editPlan(id) { const plan = plans.find(item => item.id === id); editingPlanId = id; document.querySelector("#planName").value = plan.name; document.querySelector("#planExercises").value = plan.exercises.join("\n"); document.querySelector("#planFormTitle").textContent = "Edit plan"; document.querySelector("#savePlan").textContent = "Update plan"; document.querySelector("#cancelPlanEdit").classList.remove("hidden"); }
function cancelPlanEdit() { editingPlanId = null; document.querySelector("#planName").value = ""; document.querySelector("#planExercises").value = ""; document.querySelector("#planFormTitle").textContent = "Create a plan"; document.querySelector("#savePlan").textContent = "Save plan"; document.querySelector("#cancelPlanEdit").classList.add("hidden"); }
function renderPlans() { const list = document.querySelector("#plansList"); list.classList.toggle("empty-state", !plans.length); list.innerHTML = plans.length ? plans.map(plan => `<article class="plan-card"><p class="eyebrow">${plan.exercises.length} EXERCISES</p><h3>${escapeHTML(plan.name)}</h3><ul>${plan.exercises.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul><div class="plan-card-actions"><button class="btn btn-primary" data-start-plan="${plan.id}">Start plan</button><button class="btn btn-ghost" data-edit-plan="${plan.id}">Edit</button><button class="icon-btn" data-delete-plan="${plan.id}" aria-label="Delete plan">×</button></div></article>`).join("") : "No plans saved yet."; }

function toggleFavourite() { const exercise = document.querySelector("#exerciseSelect").value; favourites = favourites.includes(exercise) ? favourites.filter(item => item !== exercise) : [...favourites, exercise]; save(KEYS.favourites, favourites); renderFavourites(); showToast(favourites.includes(exercise) ? "Added to favourites" : "Removed from favourites"); }
function renderFavourites() { const selected = document.querySelector("#exerciseSelect").value; document.querySelector("#toggleFavourite").classList.toggle("active", favourites.includes(selected)); document.querySelector("#toggleFavourite").textContent = favourites.includes(selected) ? "★" : "☆"; document.querySelector("#favouriteChips").innerHTML = favourites.map(item => `<button class="chip" data-favourite="${escapeHTML(item)}">★ ${escapeHTML(item)}</button>`).join(""); }

function renderAnalytics() { const allSets = workoutHistory.flatMap(workout => workout.sets); document.querySelector("#analyticsWorkouts").textContent = workoutHistory.length; document.querySelector("#analyticsSets").textContent = allSets.length; document.querySelector("#analyticsVolume").textContent = `${formatNumber(workoutHistory.reduce((sum, workout) => sum + workoutVolume(workout), 0))} kg`; const best = Math.max(0, ...allSets.map(set => epley(set.weight, set.reps))); document.querySelector("#analytics1rm").textContent = best ? `${formatNumber(best)} kg` : "—"; const recent = workoutHistory.slice(0, 7).reverse(); const chart = document.querySelector("#volumeChart"); chart.classList.toggle("empty-state", !recent.length); const max = Math.max(1, ...recent.map(workoutVolume)); chart.innerHTML = recent.length ? recent.map(item => `<div class="bar-wrap" title="${formatNumber(workoutVolume(item))} kg"><span class="bar" style="height:${Math.max(3, workoutVolume(item) / max * 90)}%"></span><small>${new Date(item.finishedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</small></div>`).join("") : "Finish a workout to see your volume trend."; const grouped = {}; allSets.forEach(set => { grouped[set.exercise] ??= { sets: 0, volume: 0, best: 0 }; grouped[set.exercise].sets++; grouped[set.exercise].volume += set.weight * set.reps; grouped[set.exercise].best = Math.max(grouped[set.exercise].best, epley(set.weight, set.reps)); }); const stats = document.querySelector("#exerciseStats"); const entries = Object.entries(grouped).sort((a, b) => b[1].volume - a[1].volume); stats.classList.toggle("empty-state", !entries.length); stats.innerHTML = entries.length ? entries.map(([name, data]) => `<div class="stat-row"><div><strong>${escapeHTML(name)}</strong><small>${data.sets} sets</small></div><div><strong>${formatNumber(data.volume)} kg</strong><small>volume</small></div><div><strong>${formatNumber(data.best)} kg</strong><small>best 1RM</small></div></div>`).join("") : "Exercise insights will appear here."; }
function renderGuide() { const guide = formGuides[document.querySelector("#guideExercise").value] || defaultGuide; document.querySelector("#setupCues").innerHTML = guide.setup.map(item => `<li>${item}</li>`).join(""); document.querySelector("#executionCues").innerHTML = guide.execution.map(item => `<li>${item}</li>`).join(""); document.querySelector("#mistakeCues").innerHTML = guide.mistakes.map(item => `<li>${item}</li>`).join(""); }

document.addEventListener("click", event => { const button = event.target.closest("button"); if (!button) return; if (button.dataset.view) showView(button.dataset.view); if (button.dataset.go) showView(button.dataset.go); if (button.dataset.deleteSet) deleteSet(button.dataset.deleteSet); if (button.dataset.deleteFood) { foods = foods.filter(item => item.id !== button.dataset.deleteFood); save(KEYS.foods, foods); renderNutrition(); renderDashboard(); showToast("Food removed"); } if (button.dataset.startPlan) startWorkout(plans.find(plan => plan.id === button.dataset.startPlan)); if (button.dataset.editPlan) editPlan(button.dataset.editPlan); if (button.dataset.deletePlan) askConfirmation("Delete this workout plan? This cannot be undone.", () => { plans = plans.filter(plan => plan.id !== button.dataset.deletePlan); save(KEYS.plans, plans); closeConfirmation(); renderPlans(); showToast("Plan deleted"); }); if (button.dataset.deleteWorkout) requestWorkoutDeletion(button.dataset.deleteWorkout); if (button.dataset.favourite) { document.querySelector("#exerciseSelect").value = button.dataset.favourite; renderFavourites(); } });
document.querySelector("#mobileMenu").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
document.querySelector("#dashboardStart").addEventListener("click", () => startWorkout()); document.querySelector("#addSet").addEventListener("click", addSet); document.querySelector("#finishWorkout").addEventListener("click", finishWorkout); document.querySelector("#toggleFavourite").addEventListener("click", toggleFavourite); document.querySelector("#exerciseSelect").addEventListener("change", renderFavourites); document.querySelector("#addFood").addEventListener("click", addFood); document.querySelector("#savePlan").addEventListener("click", savePlan); document.querySelector("#cancelPlanEdit").addEventListener("click", cancelPlanEdit); document.querySelector("#guideExercise").addEventListener("change", renderGuide); document.querySelector("#confirmCancel").addEventListener("click", closeConfirmation); document.querySelector("#confirmOkay").addEventListener("click", () => { if (confirmAction) confirmAction(); });
document.querySelector("#signUp").addEventListener("click", signUp); document.querySelector("#signIn").addEventListener("click", signIn); document.querySelector("#signOut").addEventListener("click", signOut);
document.querySelectorAll("[data-view-link]").forEach(link => link.addEventListener("click", event => { event.preventDefault(); showView(link.dataset.viewLink); }));
document.addEventListener("keydown", event => { if (event.key === "Escape") closeConfirmation(); if (event.key === "Enter" && document.querySelector("#workoutView").classList.contains("active") && ["weightInput", "repsInput"].includes(event.target.id)) addSet(); });

initializeSelectors(); renderAll(); initializeSupabase();
