"use strict";

// LiftTrack stores each feature separately so the data is easy to understand and maintain.
const KEYS = { current: "lifttrack_current_workout", history: "lifttrack_workout_history", foods: "lifttrack_foods", plans: "lifttrack_plans", favourites: "lifttrack_favourites" };
const PROTEIN_GOAL = 160;
// Replace only these two placeholders with values from Supabase > Project Settings > API.
const SUPABASE_URL = "https://wpyqizlgspolfnffpily.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6_skE_QXKO7BA8TuxoFgaw_7k9x18pw";
const supabaseClient = window.supabase && SUPABASE_URL !== "SUPABASE_URL" && SUPABASE_PUBLISHABLE_KEY !== "SUPABASE_PUBLISHABLE_KEY"
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

function emptyWorkout() { return { startedAt: null, planName: "", plannedExercises: [], sets: [] }; }
let currentWorkout = emptyWorkout();
let workoutHistory = [];
let authenticatedUser = null;
let authState = "checking";
let foods = [];
let plans = [];
let favourites = [];
let editingPlanId = null;
let editingSetId = null;
let confirmAction = null;
let lastRenderedStreak = null;
let resolvedAuthUserId;

function load(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } }
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function localDateKey(value = new Date()) { const date = value instanceof Date ? value : new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function dateKey(date = new Date()) { return localDateKey(date); }
function localDayNumber(value) { const date = value instanceof Date ? value : new Date(value); return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000; }
function getWeekBounds(reference = new Date()) { const start = new Date(reference); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); const end = new Date(start); end.setDate(end.getDate() + 7); return { start, end }; }
function groupWorkoutsByDay(workouts) { return workouts.reduce((days, workout) => { const key = localDateKey(workout.finishedAt); if (!days.has(key)) days.set(key, []); days.get(key).push(workout); return days; }, new Map()); }
function workoutDayNumbers(workouts) { return [...new Set(workouts.map(workout => localDayNumber(workout.finishedAt)))].sort((a, b) => a - b); }
function calculateCurrentStreak(workouts, reference = new Date()) { const days = workoutDayNumbers(workouts); if (!days.length) return 0; const today = localDayNumber(reference); let cursor = days[days.length - 1]; if (today - cursor > 1 || cursor > today) return 0; const completed = new Set(days); let streak = 0; while (completed.has(cursor)) { streak++; cursor--; } return streak; }
function calculateLongestStreak(workouts) { const days = workoutDayNumbers(workouts); let best = 0; let current = 0; let previous = null; days.forEach(day => { current = previous !== null && day === previous + 1 ? current + 1 : 1; best = Math.max(best, current); previous = day; }); return best; }
function calculateWeeklyStatistics(workouts, reference = new Date()) { const current = getWeekBounds(reference); const previousStart = new Date(current.start); previousStart.setDate(previousStart.getDate() - 7); const thisWeek = workouts.filter(workout => { const date = new Date(workout.finishedAt); return date >= current.start && date < current.end; }); const lastWeek = workouts.filter(workout => { const date = new Date(workout.finishedAt); return date >= previousStart && date < current.start; }); const volume = thisWeek.reduce((sum, workout) => sum + workoutVolume(workout), 0); const previousVolume = lastWeek.reduce((sum, workout) => sum + workoutVolume(workout), 0); return { workouts: thisWeek.length, sets: thisWeek.reduce((sum, workout) => sum + workout.sets.length, 0), volume, previousVolume, volumeChange: previousVolume ? (volume - previousVolume) / previousVolume * 100 : null, start: current.start, end: current.end }; }
function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function epley(weight, reps) { return weight * (1 + reps / 30); }
function formatNumber(number) { return Math.round(number).toLocaleString(); }
function workoutDayUnit(count) { return count === 1 ? "day" : "days"; }
function formatWorkoutDays(count) { return `${count} ${workoutDayUnit(count)}`; }
function escapeHTML(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function formatDate(value) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }

function showToast(message, type = "success") { const toast = document.createElement("div"); toast.className = `toast ${type}`; toast.textContent = message; document.querySelector("#toastContainer").append(toast); setTimeout(() => toast.remove(), 3000); }
function hasSupabaseConfig() { return !!supabaseClient; }
function requireSupabaseConfig() { if (hasSupabaseConfig()) return true; showToast("Add your Supabase Project URL and publishable key in script.js first.", "error"); return false; }
function isAuthenticated() { return authState === "authenticated" && !!authenticatedUser?.id; }
function setPrivateAppEnabled(enabled) { const shell = document.querySelector("#appShell"); shell.inert = !enabled; shell.querySelectorAll("button,input,select,textarea").forEach(control => { control.disabled = !enabled; }); shell.querySelectorAll("[data-view],[data-go],[data-view-link]").forEach(control => control.setAttribute("aria-disabled", String(!enabled))); }
function showLoadingScreen(message = "Checking your secure session…") { setPrivateAppEnabled(false); document.querySelector("#loadingTitle").nextElementSibling.textContent = message; document.querySelector("#appLoading").classList.remove("hidden"); document.querySelector("#authGate").classList.add("hidden"); document.querySelector("#appShell").classList.add("hidden"); document.querySelector("#appShell").setAttribute("aria-hidden", "true"); }
function showAuthenticationScreen() { setPrivateAppEnabled(false); document.querySelector("#appLoading").classList.add("hidden"); document.querySelector("#authGate").classList.remove("hidden"); document.querySelector("#appShell").classList.add("hidden"); document.querySelector("#appShell").setAttribute("aria-hidden", "true"); }
function showAuthenticatedApp() { setPrivateAppEnabled(true); document.querySelector("#appLoading").classList.add("hidden"); document.querySelector("#authGate").classList.add("hidden"); document.querySelector("#appShell").classList.remove("hidden"); document.querySelector("#appShell").setAttribute("aria-hidden", "false"); }
function requireAuthenticatedUser() { if (isAuthenticated()) return true; if (authState === "checking" || authState === "loading") showLoadingScreen(); else showAuthenticationScreen(); showToast("Please sign in to continue.", "error"); return false; }

function ensureWorkoutLoggerAvailable() {
  const workoutView = document.querySelector("#workoutView");
  workoutView.classList.remove("hidden");
  workoutView.removeAttribute("aria-hidden");
  workoutView.style.removeProperty("display");
  ["exerciseSelect", "weightInput", "repsInput", "addSet", "finishWorkout"].forEach(id => {
    document.querySelector(`#${id}`).disabled = false;
  });
}

function ensureNutritionTrackerAvailable() {
  const nutritionView = document.querySelector("#nutritionView");
  nutritionView.classList.remove("hidden");
  nutritionView.removeAttribute("aria-hidden");
  nutritionView.style.removeProperty("display");
  ["foodName", "foodProtein", "foodQuantity", "addFood"].forEach(id => {
    document.querySelector(`#${id}`).disabled = false;
  });
}

function ensurePlansAvailable() {
  const plansView = document.querySelector("#plansView");
  plansView.classList.remove("hidden");
  plansView.removeAttribute("aria-hidden");
  plansView.style.removeProperty("display");
  ["planName", "planExercises", "savePlan", "cancelPlanEdit", "toggleFavourite"].forEach(id => {
    document.querySelector(`#${id}`).disabled = false;
  });
}

function renderHistoryViews() {
  renderDashboard();
  renderWorkout();
  renderAnalytics();
  renderPersonalRecords();
  renderWeeklyActivity();
}

async function updateAuthUI(user) {
  const userId = user?.id || null;
  if (resolvedAuthUserId === userId && ((userId && isAuthenticated()) || (!userId && authState === "signed_out"))) return;
  if (editingPlanId) cancelPlanEdit();
  if (user) {
    authState = "loading";
    authenticatedUser = user;
    showLoadingScreen("Loading your cloud training data…");
    workoutHistory = []; foods = []; plans = []; favourites = [];
    const results = await Promise.all([loadSupabaseWorkoutHistory({ quiet: true }), loadSupabaseNutrition({ quiet: true }), loadSupabasePlans({ quiet: true }), loadSupabaseFavourites({ quiet: true })]);
    if (authenticatedUser?.id !== userId) return;
    currentWorkout = load(KEYS.current, emptyWorkout());
    initializeSelectors();
    authState = "authenticated";
    resolvedAuthUserId = userId;
    ensureWorkoutLoggerAvailable(); ensureNutritionTrackerAvailable(); ensurePlansAvailable();
    renderAll();
    showView("dashboard");
    showAuthenticatedApp();
    if (results.some(result => !result)) showToast("Some cloud data could not be loaded. Check your connection and refresh.", "error");
  } else {
    authState = "signed_out";
    authenticatedUser = null;
    currentWorkout = emptyWorkout();
    editingSetId = null;
    workoutHistory = []; foods = []; plans = []; favourites = [];
    closeConfirmation(); closePersonalRecords();
    showAuthenticationScreen();
    resolvedAuthUserId = null;
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
  await updateAuthUI(null);
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

async function loadSupabaseNutrition({ quiet = false } = {}) {
  if (!authenticatedUser || !requireSupabaseConfig()) return false;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfDay);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  // Date bounds preserve the existing daily tracker; RLS enforces user ownership.
  const { data, error } = await supabaseClient.from("nutrition_logs").select("id, food_name, protein, quantity, logged_at").gte("logged_at", startOfDay.toISOString()).lt("logged_at", startOfTomorrow.toISOString()).order("logged_at", { ascending: false });
  if (error) {
    if (!quiet) showToast(`Could not load nutrition data: ${error.message}`, "error");
    return false;
  }
  foods = data.map(row => ({ id: row.id, name: row.food_name, protein: Number(row.protein), quantity: Number(row.quantity), loggedAt: row.logged_at, source: "supabase" }));
  renderNutrition();
  renderDashboard();
  return true;
}

async function loadSupabasePlans({ quiet = false } = {}) {
  if (!authenticatedUser || !requireSupabaseConfig()) return false;
  const requestedUserId = authenticatedUser.id;
  const { data: planRows, error: plansError } = await supabaseClient.from("workout_plans").select("id, name, created_at, updated_at").order("created_at", { ascending: false });
  if (plansError) {
    if (!quiet) showToast(`Could not load workout plans: ${plansError.message}`, "error");
    return false;
  }
  let exerciseRows = [];
  if (planRows.length) {
    const { data, error } = await supabaseClient.from("workout_plan_exercises").select("id, workout_plan_id, exercise, position").order("position", { ascending: true });
    if (error) {
      if (!quiet) showToast(`Could not load plan exercises: ${error.message}`, "error");
      return false;
    }
    exerciseRows = data;
  }
  if (authenticatedUser?.id !== requestedUserId) return false;
  const exercisesByPlan = new Map();
  exerciseRows.forEach(row => {
    if (!exercisesByPlan.has(row.workout_plan_id)) exercisesByPlan.set(row.workout_plan_id, []);
    exercisesByPlan.get(row.workout_plan_id).push(row.exercise);
  });
  plans = planRows.map(plan => ({ id: plan.id, name: plan.name, exercises: exercisesByPlan.get(plan.id) || [], source: "supabase" }));
  renderPlans();
  return true;
}

async function loadSupabaseFavourites({ quiet = false } = {}) {
  if (!authenticatedUser || !requireSupabaseConfig()) return false;
  const requestedUserId = authenticatedUser.id;
  const { data, error } = await supabaseClient.from("favourite_exercises").select("id, exercise, created_at").order("created_at", { ascending: true });
  if (error) {
    if (!quiet) showToast(`Could not load favourite exercises: ${error.message}`, "error");
    return false;
  }
  if (authenticatedUser?.id !== requestedUserId) return false;
  favourites = data.map(row => row.exercise);
  renderFavourites();
  return true;
}

async function initializeSupabase() {
  authState = "checking"; showLoadingScreen();
  if (!hasSupabaseConfig()) { authState = "signed_out"; showAuthenticationScreen(); return showToast("LiftTrack needs its Supabase configuration before you can sign in.", "error"); }
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) { authState = "signed_out"; authenticatedUser = null; showAuthenticationScreen(); showToast(`Could not check your session: ${error.message}`, "error"); }
  else await updateAuthUI(data.session?.user ?? null);
  supabaseClient.auth.onAuthStateChange((_event, session) => { updateAuthUI(session?.user ?? null); });
}
function askConfirmation(message, action, label = "Delete") { confirmAction = action; document.querySelector("#confirmMessage").textContent = message; document.querySelector("#confirmOkay").textContent = label; document.querySelector("#confirmModal").classList.add("open"); document.querySelector("#confirmModal").setAttribute("aria-hidden", "false"); }
function closeConfirmation() { confirmAction = null; document.querySelector("#confirmModal").classList.remove("open"); document.querySelector("#confirmModal").setAttribute("aria-hidden", "true"); }

function showView(name) { if (!requireAuthenticatedUser()) return; if (name === "workout") ensureWorkoutLoggerAvailable(); if (name === "nutrition") ensureNutritionTrackerAvailable(); if (name === "plans") ensurePlansAvailable(); document.querySelectorAll(".view").forEach(view => view.classList.remove("active")); document.querySelector(`#${name}View`).classList.add("active"); document.querySelectorAll(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === name)); document.querySelector("#pageTitle").textContent = ({ dashboard: "Dashboard", workout: "Workout logger", nutrition: "Nutrition", plans: "Workout plans", analytics: "Analytics", guide: "Form guide" })[name]; document.querySelector(".sidebar").classList.remove("open"); window.scrollTo({ top: 0, behavior: "smooth" }); if (name === "analytics") { renderAnalytics(); renderPersonalRecords(); renderWeeklyActivity(); } }

function renderExerciseSelectors() {
  const workoutSelect = document.querySelector("#exerciseSelect");
  const guideSelect = document.querySelector("#guideExercise");
  const selectedWorkout = workoutSelect.value;
  const selectedGuide = guideSelect.value;
  const available = [...new Set([...favourites, ...currentWorkout.plannedExercises, ...exercises])];
  const options = available.map(name => `<option>${escapeHTML(name)}</option>`).join("");
  workoutSelect.innerHTML = options;
  guideSelect.innerHTML = options;
  if (available.includes(selectedWorkout)) workoutSelect.value = selectedWorkout;
  if (available.includes(selectedGuide)) guideSelect.value = selectedGuide;
}
function initializeSelectors() { renderExerciseSelectors(); }
function renderAll() { renderDashboard(); renderWorkout(); renderNutrition(); renderPlans(); renderFavourites(); renderAnalytics(); renderPersonalRecords(); renderWeeklyActivity(); renderGuide(); }

function renderDashboard() {
  const hour = new Date().getHours(); document.querySelector("#greeting").textContent = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}.`;
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
  const setCount = currentWorkout.sets.length; document.querySelector("#dashWorkoutStatus").textContent = setCount ? "In progress" : "Not started"; document.querySelector("#dashWorkoutDetail").textContent = setCount ? `${setCount} set${setCount === 1 ? "" : "s"} logged` : "Ready for your next session";
  const protein = foods.reduce((sum, food) => sum + food.protein * food.quantity, 0); document.querySelector("#dashProtein").textContent = formatNumber(protein); document.querySelector("#dashProteinBar").style.width = `${Math.min(protein / PROTEIN_GOAL * 100, 100)}%`;
  const allSets = workoutHistory.flatMap(workout => workout.sets); const best = allSets.sort((a, b) => epley(b.weight, b.reps) - epley(a.weight, a.reps))[0]; document.querySelector("#dashBest1rm").textContent = best ? `${formatNumber(epley(best.weight, best.reps))} kg` : "—"; document.querySelector("#dashBestExercise").textContent = best ? best.exercise : "Log sets to establish a best";
  const last = workoutHistory[0]; document.querySelector("#lastWorkout").innerHTML = last ? `<div class="history-card"><div><strong>${escapeHTML(last.name || "Workout")}</strong><small>${formatDate(last.finishedAt)}</small></div><div><strong>${last.sets.length}</strong><small>sets</small></div><div><strong>${formatNumber(workoutVolume(last))} kg</strong><small>volume</small></div><div><strong>${new Set(last.sets.map(set => set.exercise)).size}</strong><small>exercises</small></div></div>` : "No completed workouts yet. Your first session will appear here.";
  const currentStreak = calculateCurrentStreak(workoutHistory); const bestStreak = calculateLongestStreak(workoutHistory); document.querySelector("#currentStreak").textContent = currentStreak; document.querySelector("#currentStreakUnit").textContent = ` ${workoutDayUnit(currentStreak)}`; document.querySelector("#bestStreakText").textContent = formatWorkoutDays(bestStreak); const streakCard = document.querySelector("#streakCard"); if (lastRenderedStreak !== null && currentStreak > lastRenderedStreak) { streakCard.classList.remove("streak-increased"); void streakCard.offsetWidth; streakCard.classList.add("streak-increased"); } lastRenderedStreak = currentStreak;
}

function startWorkout(plan = null) { if (!requireAuthenticatedUser()) return; if (!currentWorkout.startedAt) currentWorkout.startedAt = new Date().toISOString(); if (plan) { currentWorkout.planName = plan.name; currentWorkout.plannedExercises = plan.exercises; renderExerciseSelectors(); if (plan.exercises.length) document.querySelector("#exerciseSelect").value = plan.exercises[0]; renderFavourites(); } save(KEYS.current, currentWorkout); renderWorkout(); showView("workout"); showToast(plan ? `${plan.name} started` : "Workout ready"); }
function addSet() { if (!requireAuthenticatedUser()) return; const exercise = document.querySelector("#exerciseSelect").value; const weight = Number(document.querySelector("#weightInput").value); const reps = Number(document.querySelector("#repsInput").value); if (!weight || weight <= 0 || !Number.isInteger(reps) || reps <= 0) return showToast("Enter a valid weight and whole-number reps.", "error"); if (!currentWorkout.startedAt) currentWorkout.startedAt = new Date().toISOString(); const existing = editingSetId ? currentWorkout.sets.find(set => set.id === editingSetId) : null; if (existing) Object.assign(existing, { exercise, weight, reps }); else currentWorkout.sets.push({ id: uid(), exercise, weight, reps, createdAt: new Date().toISOString() }); const message = existing ? `${exercise} set updated` : `${exercise} set added`; editingSetId = null; document.querySelector("#addSet").textContent = "Add set"; save(KEYS.current, currentWorkout); document.querySelector("#repsInput").value = ""; renderWorkout(); renderDashboard(); showToast(message); }
function editSet(id) { if (!requireAuthenticatedUser()) return; const set = currentWorkout.sets.find(item => item.id === id); if (!set) return; editingSetId = id; document.querySelector("#exerciseSelect").value = set.exercise; document.querySelector("#weightInput").value = set.weight; document.querySelector("#repsInput").value = set.reps; document.querySelector("#addSet").textContent = "Update set"; document.querySelector("#weightInput").focus(); }
function deleteSet(id) { if (!requireAuthenticatedUser()) return; currentWorkout.sets = currentWorkout.sets.filter(set => set.id !== id); if (editingSetId === id) { editingSetId = null; document.querySelector("#addSet").textContent = "Add set"; } if (!currentWorkout.sets.length) currentWorkout.startedAt = null; save(KEYS.current, currentWorkout); renderWorkout(); renderDashboard(); showToast("Set removed"); }
function volumeOf(sets) { return sets.reduce((sum, set) => sum + set.weight * set.reps, 0); }
function workoutVolume(workout) { return Number.isFinite(workout.totalVolume) ? workout.totalVolume : volumeOf(workout.sets); }
function bestEstimated1RMs(sets) {
  return sets.reduce((bests, set) => {
    const estimate = epley(Number(set.weight), Number(set.reps));
    if (Number.isFinite(estimate) && estimate > (bests[set.exercise] || 0)) bests[set.exercise] = estimate;
    return bests;
  }, {});
}
function detectPersonalRecords(currentSets, historicalSets) {
  const currentBests = bestEstimated1RMs(currentSets);
  const previousBests = bestEstimated1RMs(historicalSets);
  return Object.entries(currentBests)
    .filter(([exercise, best]) => !previousBests[exercise] || best > previousBests[exercise])
    .map(([exercise, best]) => ({ exercise, previousBest: previousBests[exercise] || null, newBest: best }));
}
async function loadPreviousSetsForExercises(exerciseNames) {
  const { data, error } = await supabaseClient.from("workout_sets").select("exercise, weight, reps").in("exercise", exerciseNames);
  if (error) throw error;
  return data || [];
}
function showPersonalRecords(records) {
  if (!records.length) return;
  document.querySelector("#prTitle").textContent = records.length === 1 ? "NEW PR 🔥" : `${records.length} NEW PRs 🔥`;
  document.querySelector("#prResults").innerHTML = records.map(record => `<div class="pr-result${record.previousBest ? "" : " first"}"><div class="pr-result-head"><strong>${escapeHTML(record.exercise)}</strong>${record.previousBest ? `<span class="pr-result-gain">+${formatNumber(record.newBest - record.previousBest)} kg</span>` : ""}</div><small>${record.previousBest ? `${formatNumber(record.previousBest)} → ${formatNumber(record.newBest)} kg` : `First recorded PR · ${formatNumber(record.newBest)} kg`}</small></div>`).join("");
  document.querySelector("#prModal").classList.add("open");
  document.querySelector("#prModal").setAttribute("aria-hidden", "false");
}
function closePersonalRecords() { document.querySelector("#prModal").classList.remove("open"); document.querySelector("#prModal").setAttribute("aria-hidden", "true"); }
function clearCurrentWorkout() {
  currentWorkout = { startedAt: null, planName: "", plannedExercises: [], sets: [] };
  editingSetId = null; document.querySelector("#addSet").textContent = "Add set";
  save(KEYS.current, currentWorkout);
}

async function finishAuthenticatedWorkout() {
  if (!requireAuthenticatedUser()) return;
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    showToast(userError?.message || "Your session expired. Sign in again before finishing.", "error");
    return;
  }
  const completedSets = currentWorkout.sets.map(set => ({ ...set }));
  const exerciseNames = [...new Set(completedSets.map(set => set.exercise))];
  let personalRecords = [];
  let prComparisonError = null;
  try {
    const previousSets = await loadPreviousSetsForExercises(exerciseNames);
    personalRecords = detectPersonalRecords(completedSets, previousSets);
  } catch (error) {
    prComparisonError = error;
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
  const completedWorkout = { id: session.id, name: sessionPayload.name, startedAt: currentWorkout.startedAt, finishedAt: completedAt, totalVolume: sessionPayload.total_volume, source: "supabase", sets: completedSets };
  clearCurrentWorkout();
  closeConfirmation();
  const refreshed = await loadSupabaseWorkoutHistory({ quiet: true });
  if (!refreshed) {
    workoutHistory = [completedWorkout, ...workoutHistory.filter(workout => workout.id !== session.id)];
    renderAll();
  }
  showView("dashboard");
  showToast(refreshed ? "Workout saved to Supabase." : "Workout saved, but history could not be refreshed.", refreshed ? "success" : "error");
  showPersonalRecords(personalRecords);
  if (prComparisonError) showToast(`Workout saved, but PRs could not be compared: ${prComparisonError.message}`, "error");
}

async function deleteSupabaseWorkout(id) {
  if (!requireAuthenticatedUser()) return;
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
  if (!requireAuthenticatedUser()) return;
  const workout = workoutHistory.find(item => item.id === id);
  if (!workout) return;
  askConfirmation("Delete this completed workout and remove it from analytics?", async () => {
    if (workout.source === "supabase") return deleteSupabaseWorkout(id);
    closeConfirmation();
    showToast("Only cloud-backed workouts can be deleted.", "error");
  });
}

function finishWorkout() {
  if (!requireAuthenticatedUser()) return;
  if (!currentWorkout.sets.length) return showToast("Add at least one set before finishing.", "error");
  askConfirmation("Finish and save this workout to your history?", async () => {
    await finishAuthenticatedWorkout();
  }, "Finish");
}
function renderWorkout() { const sets = currentWorkout.sets; document.querySelector("#workoutHeading").textContent = currentWorkout.planName || "Today’s workout"; document.querySelector("#workoutStarted").textContent = currentWorkout.startedAt ? `Started ${new Date(currentWorkout.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Add your first working set to begin."; document.querySelector("#currentSets").textContent = sets.length; document.querySelector("#currentVolume").textContent = `${formatNumber(volumeOf(sets))} kg`; const best = Math.max(0, ...sets.map(set => epley(set.weight, set.reps))); document.querySelector("#current1rm").textContent = best ? `${formatNumber(best)} kg` : "—"; document.querySelector("#sessionPill").textContent = sets.length ? "In progress" : "Waiting"; document.querySelector("#sessionPill").classList.toggle("live", !!sets.length); const list = document.querySelector("#currentSetList"); list.classList.toggle("empty-state", !sets.length); list.innerHTML = sets.length ? sets.map((set, index) => `<div class="set-row"><span class="set-number">${index + 1}</span><div><strong>${escapeHTML(set.exercise)}</strong><small>Exercise</small></div><div><strong>${set.weight} kg</strong><small>Weight</small></div><div><strong>${set.reps}</strong><small>Reps</small></div><div><strong>${formatNumber(epley(set.weight, set.reps))} kg</strong><small>Est. 1RM</small></div><button class="icon-btn edit-set-btn" data-edit-set="${set.id}" aria-label="Edit set">✎</button><button class="icon-btn" data-delete-set="${set.id}" aria-label="Delete set">×</button></div>`).join("") : "No sets logged yet."; const history = document.querySelector("#historyList"); history.classList.toggle("empty-state", !workoutHistory.length); history.innerHTML = workoutHistory.length ? workoutHistory.map(workout => `<div class="history-card"><div><strong>${escapeHTML(workout.name)}</strong><small>${formatDate(workout.finishedAt)}</small></div><div><strong>${workout.sets.length}</strong><small>sets</small></div><div><strong>${formatNumber(workoutVolume(workout))} kg</strong><small>volume</small></div><div><strong>${new Set(workout.sets.map(set => set.exercise)).size}</strong><small>exercises</small></div><button class="icon-btn" data-delete-workout="${workout.id}" aria-label="Delete workout">×</button></div>`).join("") : "Completed workouts will be saved here."; }

function clearFoodInputs() { document.querySelector("#foodName").value = ""; document.querySelector("#foodProtein").value = ""; document.querySelector("#foodQuantity").value = "1"; }
async function addFood() {
  if (!requireAuthenticatedUser()) return;
  const name = document.querySelector("#foodName").value.trim();
  const protein = Number(document.querySelector("#foodProtein").value);
  const quantity = Number(document.querySelector("#foodQuantity").value);
  if (!name || protein <= 0 || quantity <= 0) return showToast("Complete all food fields with positive values.", "error");
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) return showToast(userError?.message || "Your session expired. Sign in again before adding food.", "error");
  const { error } = await supabaseClient.from("nutrition_logs").insert({ user_id: user.id, food_name: name, protein, quantity });
  if (error) return showToast(`Food was not saved: ${error.message}`, "error");
  clearFoodInputs();
  const refreshed = await loadSupabaseNutrition({ quiet: true });
  showToast(refreshed ? "Food added to Supabase." : "Food was saved, but nutrition data could not be refreshed.", refreshed ? "success" : "error");
}

async function deleteFood(id) {
  if (!requireAuthenticatedUser()) return;
  const { error } = await supabaseClient.from("nutrition_logs").delete().eq("id", id);
  if (error) return showToast(`Food could not be deleted: ${error.message}`, "error");
  const refreshed = await loadSupabaseNutrition({ quiet: true });
  if (!refreshed) foods = foods.filter(item => item.id !== id);
  renderNutrition();
  renderDashboard();
  showToast(refreshed ? "Food removed." : "Food removed, but nutrition data could not be refreshed.", refreshed ? "success" : "error");
}
function renderNutrition() { const total = foods.reduce((sum, food) => sum + food.protein * food.quantity, 0); const percent = Math.min(total / PROTEIN_GOAL * 100, 100); document.querySelector("#proteinTotal").textContent = `${formatNumber(total)}g`; document.querySelector("#proteinRing").style.setProperty("--protein", `${percent * 3.6}deg`); document.querySelector("#proteinMessage").textContent = total >= PROTEIN_GOAL ? "Goal reached. Recovery is covered." : `${formatNumber(PROTEIN_GOAL - total)}g remaining today.`; document.querySelector("#foodCount").textContent = `${foods.length} item${foods.length === 1 ? "" : "s"}`; const list = document.querySelector("#foodList"); list.classList.toggle("empty-state", !foods.length); list.innerHTML = foods.length ? foods.map(food => `<div class="food-row"><div><strong>${escapeHTML(food.name)}</strong><small>${food.protein}g per serving</small></div><div><strong>${food.quantity}</strong><small>quantity</small></div><div><strong>${formatNumber(food.protein * food.quantity)}g</strong><small>protein</small></div><button class="icon-btn" data-delete-food="${food.id}" aria-label="Delete food">×</button></div>`).join("") : "No foods logged today."; }

function planExerciseRows(planId, planExercises) { return planExercises.map((exercise, position) => ({ workout_plan_id: planId, exercise, position })); }

async function createSupabasePlan(user, name, planExercises) {
  const { data: plan, error: planError } = await supabaseClient.from("workout_plans").insert({ user_id: user.id, name }).select("id").single();
  if (planError) return showToast(`Plan was not created: ${planError.message}`, "error");
  const { error: exercisesError } = await supabaseClient.from("workout_plan_exercises").insert(planExerciseRows(plan.id, planExercises));
  if (exercisesError) {
    const { error: cleanupError } = await supabaseClient.from("workout_plans").delete().eq("id", plan.id);
    const cleanupMessage = cleanupError ? ` Cleanup also failed: ${cleanupError.message}` : " The incomplete plan was removed.";
    return showToast(`Plan exercises were not saved: ${exercisesError.message}.${cleanupMessage}`, "error");
  }
  cancelPlanEdit();
  const refreshed = await loadSupabasePlans({ quiet: true });
  showToast(refreshed ? "Plan created." : "Plan created, but plans could not be refreshed.", refreshed ? "success" : "error");
}

async function updateSupabasePlan(plan, name, planExercises) {
  const { error: nameError } = await supabaseClient.from("workout_plans").update({ name }).eq("id", plan.id);
  if (nameError) return showToast(`Plan was not updated: ${nameError.message}`, "error");
  const { error: deleteError } = await supabaseClient.from("workout_plan_exercises").delete().eq("workout_plan_id", plan.id);
  if (deleteError) {
    await supabaseClient.from("workout_plans").update({ name: plan.name }).eq("id", plan.id);
    return showToast(`Existing plan exercises could not be replaced: ${deleteError.message}`, "error");
  }
  const { error: insertError } = await supabaseClient.from("workout_plan_exercises").insert(planExerciseRows(plan.id, planExercises));
  if (insertError) {
    const rollbackResults = await Promise.all([
      supabaseClient.from("workout_plans").update({ name: plan.name }).eq("id", plan.id),
      plan.exercises.length ? supabaseClient.from("workout_plan_exercises").insert(planExerciseRows(plan.id, plan.exercises)) : Promise.resolve({ error: null })
    ]);
    const rollbackError = rollbackResults.find(result => result.error)?.error;
    const rollbackMessage = rollbackError ? ` Rollback also failed: ${rollbackError.message}` : " The previous plan was restored.";
    return showToast(`Updated exercises were not saved: ${insertError.message}.${rollbackMessage}`, "error");
  }
  cancelPlanEdit();
  const refreshed = await loadSupabasePlans({ quiet: true });
  showToast(refreshed ? "Plan updated." : "Plan updated, but plans could not be refreshed.", refreshed ? "success" : "error");
}

async function savePlan() {
  if (!requireAuthenticatedUser()) return;
  const name = document.querySelector("#planName").value.trim();
  const planExercises = document.querySelector("#planExercises").value.split("\n").map(item => item.trim()).filter(Boolean);
  if (!name || !planExercises.length) return showToast("Add a plan name and at least one exercise.", "error");
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) return showToast(userError?.message || "Your session expired. Sign in again before saving a plan.", "error");
  const existingPlan = editingPlanId ? plans.find(item => item.id === editingPlanId) : null;
  return existingPlan ? updateSupabasePlan(existingPlan, name, planExercises) : createSupabasePlan(user, name, planExercises);
}
function editPlan(id) { const plan = plans.find(item => item.id === id); editingPlanId = id; document.querySelector("#planName").value = plan.name; document.querySelector("#planExercises").value = plan.exercises.join("\n"); document.querySelector("#planFormTitle").textContent = "Edit plan"; document.querySelector("#savePlan").textContent = "Update plan"; document.querySelector("#cancelPlanEdit").classList.remove("hidden"); }
function cancelPlanEdit() { editingPlanId = null; document.querySelector("#planName").value = ""; document.querySelector("#planExercises").value = ""; document.querySelector("#planFormTitle").textContent = "Create a plan"; document.querySelector("#savePlan").textContent = "Save plan"; document.querySelector("#cancelPlanEdit").classList.add("hidden"); }
function renderPlans() { const list = document.querySelector("#plansList"); list.classList.toggle("empty-state", !plans.length); list.innerHTML = plans.length ? plans.map(plan => `<article class="plan-card"><p class="eyebrow">${plan.exercises.length} EXERCISES</p><h3>${escapeHTML(plan.name)}</h3><ul>${plan.exercises.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul><div class="plan-card-actions"><button class="btn btn-primary" data-start-plan="${plan.id}">Start plan</button><button class="btn btn-ghost" data-edit-plan="${plan.id}">Edit</button><button class="icon-btn" data-delete-plan="${plan.id}" aria-label="Delete plan">×</button></div></article>`).join("") : "No plans saved yet."; }

async function deletePlan(id) {
  if (!requireAuthenticatedUser()) return;
  const plan = plans.find(item => item.id === id);
  if (!plan) return;
  if (plan.source === "supabase") {
    const { error } = await supabaseClient.from("workout_plans").delete().eq("id", id);
    if (error) { closeConfirmation(); return showToast(`Plan could not be deleted: ${error.message}`, "error"); }
    closeConfirmation();
    const refreshed = await loadSupabasePlans({ quiet: true });
    if (!refreshed) plans = plans.filter(item => item.id !== id);
    renderPlans();
    return showToast(refreshed ? "Plan deleted." : "Plan deleted, but plans could not be refreshed.", refreshed ? "success" : "error");
  }
  closeConfirmation();
  showToast("Only cloud-backed plans can be deleted.", "error");
}

function requestPlanDeletion(id) { askConfirmation("Delete this workout plan? This cannot be undone.", () => deletePlan(id)); }

async function toggleFavourite() {
  if (!requireAuthenticatedUser()) return;
  const exercise = document.querySelector("#exerciseSelect").value;
  const isFavourite = favourites.includes(exercise);
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) return showToast(userError?.message || "Your session expired. Sign in again before updating favourites.", "error");
  const query = isFavourite
    ? supabaseClient.from("favourite_exercises").delete().eq("exercise", exercise)
    : supabaseClient.from("favourite_exercises").insert({ user_id: user.id, exercise });
  const { error } = await query;
  if (error) return showToast(`Favourite was not updated: ${error.message}`, "error");
  const refreshed = await loadSupabaseFavourites({ quiet: true });
  showToast(refreshed ? (isFavourite ? "Removed from favourites" : "Added to favourites") : "Favourite changed, but favourites could not be refreshed.", refreshed ? "success" : "error");
}
function renderFavourites() { const selected = document.querySelector("#exerciseSelect").value; renderExerciseSelectors(); const activeExercise = document.querySelector("#exerciseSelect").value || selected; document.querySelector("#toggleFavourite").classList.toggle("active", favourites.includes(activeExercise)); document.querySelector("#toggleFavourite").textContent = favourites.includes(activeExercise) ? "★" : "☆"; document.querySelector("#favouriteChips").innerHTML = favourites.map(item => `<button class="chip" data-favourite="${escapeHTML(item)}">★ ${escapeHTML(item)}</button>`).join(""); }

function renderAnalytics() { const allSets = workoutHistory.flatMap(workout => workout.sets); document.querySelector("#analyticsWorkouts").textContent = workoutHistory.length; document.querySelector("#analyticsSets").textContent = allSets.length; document.querySelector("#analyticsVolume").textContent = `${formatNumber(workoutHistory.reduce((sum, workout) => sum + workoutVolume(workout), 0))} kg`; const best = Math.max(0, ...allSets.map(set => epley(set.weight, set.reps))); document.querySelector("#analytics1rm").textContent = best ? `${formatNumber(best)} kg` : "—"; const recent = workoutHistory.slice(0, 7).reverse(); const chart = document.querySelector("#volumeChart"); chart.classList.toggle("empty-state", !recent.length); const max = Math.max(1, ...recent.map(workoutVolume)); chart.innerHTML = recent.length ? recent.map(item => `<div class="bar-wrap" title="${formatNumber(workoutVolume(item))} kg"><span class="bar" style="height:${Math.max(3, workoutVolume(item) / max * 90)}%"></span><small>${new Date(item.finishedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</small></div>`).join("") : "Finish a workout to see your volume trend."; const grouped = {}; allSets.forEach(set => { grouped[set.exercise] ??= { sets: 0, volume: 0, best: 0 }; grouped[set.exercise].sets++; grouped[set.exercise].volume += set.weight * set.reps; grouped[set.exercise].best = Math.max(grouped[set.exercise].best, epley(set.weight, set.reps)); }); const stats = document.querySelector("#exerciseStats"); const entries = Object.entries(grouped).sort((a, b) => b[1].volume - a[1].volume); stats.classList.toggle("empty-state", !entries.length); stats.innerHTML = entries.length ? entries.map(([name, data]) => `<div class="stat-row"><div><strong>${escapeHTML(name)}</strong><small>${data.sets} sets</small></div><div><strong>${formatNumber(data.volume)} kg</strong><small>volume</small></div><div><strong>${formatNumber(data.best)} kg</strong><small>best 1RM</small></div></div>`).join("") : "Exercise insights will appear here."; }
function renderGuide() { const guide = formGuides[document.querySelector("#guideExercise").value] || defaultGuide; document.querySelector("#setupCues").innerHTML = guide.setup.map(item => `<li>${item}</li>`).join(""); document.querySelector("#executionCues").innerHTML = guide.execution.map(item => `<li>${item}</li>`).join(""); document.querySelector("#mistakeCues").innerHTML = guide.mistakes.map(item => `<li>${item}</li>`).join(""); }

document.addEventListener("click", event => { const button = event.target.closest("button"); if (!button) return; if (button.closest("#appShell") && !requireAuthenticatedUser()) return; if (button.dataset.view) showView(button.dataset.view); if (button.dataset.go) showView(button.dataset.go); if (button.dataset.editSet) editSet(button.dataset.editSet); if (button.dataset.deleteSet) deleteSet(button.dataset.deleteSet); if (button.dataset.deleteFood) deleteFood(button.dataset.deleteFood); if (button.dataset.startPlan) startWorkout(plans.find(plan => plan.id === button.dataset.startPlan)); if (button.dataset.editPlan) editPlan(button.dataset.editPlan); if (button.dataset.deletePlan) requestPlanDeletion(button.dataset.deletePlan); if (button.dataset.deleteWorkout) requestWorkoutDeletion(button.dataset.deleteWorkout); if (button.dataset.favourite) { document.querySelector("#exerciseSelect").value = button.dataset.favourite; renderFavourites(); } });
document.querySelector("#mobileMenu").addEventListener("click", () => { if (requireAuthenticatedUser()) document.querySelector(".sidebar").classList.toggle("open"); });
document.querySelector("#dashboardStart").addEventListener("click", () => startWorkout()); document.querySelector("#addSet").addEventListener("click", addSet); document.querySelector("#finishWorkout").addEventListener("click", finishWorkout); document.querySelector("#toggleFavourite").addEventListener("click", toggleFavourite); document.querySelector("#exerciseSelect").addEventListener("change", () => { if (requireAuthenticatedUser()) renderFavourites(); }); document.querySelector("#addFood").addEventListener("click", addFood); document.querySelector("#savePlan").addEventListener("click", savePlan); document.querySelector("#cancelPlanEdit").addEventListener("click", () => { if (requireAuthenticatedUser()) cancelPlanEdit(); }); document.querySelector("#guideExercise").addEventListener("change", () => { if (requireAuthenticatedUser()) renderGuide(); }); document.querySelector("#confirmCancel").addEventListener("click", closeConfirmation); document.querySelector("#confirmOkay").addEventListener("click", () => { if (confirmAction && requireAuthenticatedUser()) confirmAction(); });
document.querySelector("#signUp").addEventListener("click", signUp); document.querySelector("#signIn").addEventListener("click", signIn); document.querySelector("#signOut").addEventListener("click", signOut);
document.querySelector("#closePrModal").addEventListener("click", closePersonalRecords);
document.querySelector("#prModal").addEventListener("click", event => { if (event.target.id === "prModal") closePersonalRecords(); });
document.querySelectorAll("[data-view-link]").forEach(link => link.addEventListener("click", event => { event.preventDefault(); showView(link.dataset.viewLink); }));
document.addEventListener("keydown", event => { if (event.key === "Escape") closeConfirmation(); if (event.key === "Enter" && !document.querySelector("#authGate").classList.contains("hidden") && ["authEmail", "authPassword"].includes(event.target.id)) signIn(); else if (event.key === "Enter" && document.querySelector("#workoutView").classList.contains("active") && ["weightInput", "repsInput"].includes(event.target.id)) addSet(); });

function renderPersonalRecords() {
  const records = Object.entries(bestEstimated1RMs(workoutHistory.flatMap(workout => workout.sets))).sort((a, b) => b[1] - a[1]);
  const list = document.querySelector("#personalRecords");
  document.querySelector("#personalRecordCount").textContent = `${records.length} exercise${records.length === 1 ? "" : "s"}`;
  list.classList.toggle("empty-state", !records.length);
  list.innerHTML = records.length ? records.map(([exercise, best]) => `<div class="record-row"><div><strong>${escapeHTML(exercise)}</strong><small>Estimated 1RM</small></div><strong class="record-value">${formatNumber(best)} kg</strong></div>`).join("") : "Finish a workout to establish your first personal record.";
}

function renderWeeklyActivity(reference = new Date()) {
  const stats = calculateWeeklyStatistics(workoutHistory, reference);
  const grouped = groupWorkoutsByDay(workoutHistory);
  const formatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
  const lastDay = new Date(stats.end); lastDay.setDate(lastDay.getDate() - 1);
  document.querySelector("#weekRange").textContent = `${formatter.format(stats.start)} – ${formatter.format(lastDay)}`;
  document.querySelector("#weeklyDays").innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(stats.start); date.setDate(date.getDate() + index);
    const active = grouped.has(localDateKey(date));
    const today = localDateKey(date) === localDateKey(reference);
    return `<div class="weekly-day${active ? " active" : ""}${today ? " today" : ""}"><span>${["M", "T", "W", "T", "F", "S", "S"][index]}</span><i aria-label="${active ? "Workout completed" : "No workout"}"></i><small>${date.getDate()}</small></div>`;
  }).join("");
  document.querySelector("#weekWorkouts").textContent = stats.workouts;
  document.querySelector("#weekSets").textContent = stats.sets;
  document.querySelector("#weekVolume").textContent = `${formatNumber(stats.volume)} kg`;
  const change = document.querySelector("#weekVolumeChange"); change.classList.remove("positive", "negative");
  if (stats.volumeChange === null) change.textContent = "No previous week data";
  else { const rounded = Math.round(Math.abs(stats.volumeChange)); change.textContent = `${stats.volumeChange >= 0 ? "↑" : "↓"} ${rounded}%`; change.classList.add(stats.volumeChange >= 0 ? "positive" : "negative"); }
}

function updateNetworkStatus() { const offline = !navigator.onLine; document.querySelector("#offlineBanner").classList.toggle("hidden", !offline); document.body.classList.toggle("is-offline", offline); }
function initializePWA() { updateNetworkStatus(); window.addEventListener("online", updateNetworkStatus); window.addEventListener("offline", updateNetworkStatus); if ("serviceWorker" in navigator && ["http:", "https:"].includes(location.protocol)) navigator.serviceWorker.register("./service-worker.js").catch(error => console.warn("Service worker registration failed:", error)); }

initializePWA(); initializeSupabase();
