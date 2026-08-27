"use strict";
console.log("BOOT 1: LiftTrack script loaded");

// LiftTrack stores each feature separately so the data is easy to understand and maintain.
const KEYS = { current: "lifttrack_current_workout", history: "lifttrack_workout_history", foods: "lifttrack_foods", plans: "lifttrack_plans", favourites: "lifttrack_favourites" };
const DEFAULT_PROTEIN_GOAL = 160;
const PROTEIN_FACTORS = { build: 1.8, maintain: 1.6, fat_loss: 1.8 };
// Replace only these two placeholders with values from Supabase > Project Settings > API.
const SUPABASE_URL = "https://wpyqizlgspolfnffpily.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6_skE_QXKO7BA8TuxoFgaw_7k9x18pw";
let supabaseClient = null;
async function initializeSupabaseClient() {
  if (!window.supabase) {
    const sdkLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Supabase SDK could not be loaded."));
      document.head.append(script);
    });
    await withTimeout(sdkLoad, 10000, "Supabase SDK load");
  }
  console.log("BOOT 2: Supabase SDK load completed", { available: !!window.supabase });
  if (!window.supabase) throw new Error("Supabase SDK is unavailable.");
  if (SUPABASE_URL === "SUPABASE_URL" || SUPABASE_PUBLISHABLE_KEY === "SUPABASE_PUBLISHABLE_KEY") throw new Error("Supabase is not configured.");
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  console.log("BOOT 3: Supabase client created");
}
const EXERCISE_CATEGORIES = {
  Chest: ["Bench Press", "Incline Bench Press", "Decline Bench Press", "Dumbbell Bench Press", "Incline Dumbbell Press", "Chest Fly", "Cable Fly", "Push Ups", "Machine Chest Press", "Pec Deck"],
  Back: ["Lat Pulldown", "Wide Grip Lat Pulldown", "Close Grip Lat Pulldown", "Chest Supported Row", "Seated Cable Row", "Barbell Row", "T Bar Row", "Single Arm Dumbbell Row", "Machine Row", "Straight Arm Pulldown", "Face Pull", "Rack Pull", "Deadlift", "Pull-Up"],
  Shoulders: ["Overhead Press", "Dumbbell Shoulder Press", "Arnold Press", "Lateral Raise", "Cable Lateral Raise", "Front Raise", "Rear Delt Fly", "Reverse Pec Deck", "Upright Row"],
  Biceps: ["Dumbbell Curl", "Hammer Curl", "Barbell Curl", "EZ Bar Curl", "Preacher Curl", "Cable Curl", "Incline Dumbbell Curl", "Concentration Curl"],
  Triceps: ["Tricep Pushdown", "Overhead Tricep Extension", "Skull Crushers", "Close Grip Bench Press", "Dips", "Cable Overhead Extension", "Rope Pushdown"],
  Legs: ["Squat", "Back Squat", "Front Squat", "Leg Press", "Hack Squat", "Bulgarian Split Squat", "Walking Lunges", "Leg Extension", "Leg Curl", "Romanian Deadlift", "Stiff Leg Deadlift", "Standing Calf Raise", "Seated Calf Raise"],
  Glutes: ["Hip Thrust", "Glute Bridge", "Cable Kickback", "Sumo Deadlift"],
  Abs: ["Crunch", "Cable Crunch", "Hanging Leg Raise", "Plank", "Ab Wheel Rollout", "Russian Twist"]
};
Object.values(EXERCISE_CATEGORIES).forEach(items => items.sort((a, b) => a.localeCompare(b)));
const exercises = [...new Map(Object.values(EXERCISE_CATEGORIES).flat().map(name => [name.toLocaleLowerCase(), name])).values()];
const exerciseCategory = name => Object.entries(EXERCISE_CATEGORIES).find(([, items]) => items.some(item => exerciseKey(item) === exerciseKey(name)))?.[0] || "Custom";
function formGuide(primary, secondary, equipment, difficulty, setup, execution, breathing, mistakes, safety) { return { muscles: primary, secondary, equipment, difficulty, setup, execution, breathing, mistakes, safety }; }
const formGuides = {
  "Lat Pulldown": formGuide("Latissimus dorsi", "Biceps, teres major, mid-back", "Cable pulldown", "Beginner", ["Secure your thighs under the pad.", "Grip slightly wider than shoulder width.", "Keep the chest tall with a small backward lean.", "Start with shoulders down, not shrugged."], ["Pull the bar toward the upper chest.", "Drive elbows down and slightly back.", "Keep the torso mostly still and pause at the bottom.", "Return under control until the arms extend."], ["Exhale while pulling down.", "Inhale while returning."], ["Pulling behind the neck.", "Swinging the torso.", "Shrugging or turning the pull into an arm curl."], ["Choose a load that permits controlled elbow drive and a stable torso."]),
  "Chest Supported Row": formGuide("Mid-back and latissimus dorsi", "Rear delts, biceps", "Incline bench and dumbbells or row machine", "Beginner", ["Set the pad so the chest is fully supported.", "Plant the feet and let the arms hang beneath the shoulders."], ["Pull elbows back toward the hips.", "Pause as the shoulder blades move together.", "Lower until the arms extend without lifting off the pad."], ["Exhale on the row.", "Inhale while lowering."], ["Shrugging toward the ears.", "Lifting the chest from the pad.", "Shortening the lowering phase."], ["Keep the neck aligned with the spine and the chest supported."]),
  "Seated Cable Row": formGuide("Latissimus dorsi and mid-back", "Biceps, rear delts", "Cable row", "Beginner", ["Sit tall with feet braced and knees softly bent.", "Reach the handle without rounding the lower back."], ["Pull the handle toward the lower ribs.", "Drive elbows behind the torso and pause.", "Extend the arms while keeping the torso stable."], ["Exhale while rowing.", "Inhale on the reach."], ["Rocking forward and backward.", "Shrugging.", "Pulling only with the hands."], ["Keep the spine neutral; the movement should come mainly from the shoulders and elbows."]),
  "Barbell Row": formGuide("Mid-back and latissimus dorsi", "Rear delts, biceps, spinal erectors", "Barbell", "Intermediate", ["Hinge at the hips with knees softly bent.", "Brace the trunk and hold the bar below the shoulders."], ["Row the bar toward the lower ribs.", "Keep the torso angle steady.", "Lower until the elbows extend without losing the brace."], ["Exhale during the row.", "Inhale and reset at the bottom."], ["Standing up during each rep.", "Rounding the lower back.", "Jerking the bar."], ["Reduce the load if you cannot hold a stable hip hinge."]),
  "Single Arm Dumbbell Row": formGuide("Latissimus dorsi", "Mid-back, rear delts, biceps", "Dumbbell and bench", "Beginner", ["Support one hand and knee on a bench.", "Square the hips and let the working arm hang."], ["Pull the elbow toward the hip.", "Pause without rotating the torso.", "Lower the dumbbell to a full controlled reach."], ["Exhale as you row.", "Inhale while lowering."], ["Twisting the torso.", "Shrugging the shoulder.", "Pulling toward the chest instead of the hip."], ["Keep the supporting shoulder strong and the spine neutral."]),
  "Bench Press": formGuide("Pectoralis major", "Triceps, front delts", "Barbell, bench and rack", "Intermediate", ["Plant the feet and keep the eyes under the bar.", "Retract and lower the shoulder blades.", "Grip so forearms are vertical at the bottom."], ["Lower the bar to the lower chest.", "Keep wrists stacked over elbows.", "Press up and slightly back while maintaining upper-back tension."], ["Inhale and brace before lowering.", "Exhale through the press."], ["Bouncing the bar.", "Elbows flaring straight sideways.", "Shoulders rolling forward or hips lifting."], ["Use safeties or a spotter for challenging sets."]),
  "Incline Bench Press": formGuide("Upper chest", "Triceps, front delts", "Incline bench and barbell", "Intermediate", ["Set a low-to-moderate incline.", "Plant the feet and pin the shoulder blades to the bench."], ["Lower the bar toward the upper chest.", "Keep forearms close to vertical.", "Press without letting the shoulders roll forward."], ["Inhale while lowering.", "Exhale through the press."], ["Using an overly steep bench.", "Flaring elbows excessively.", "Bouncing the bar."], ["Use rack safeties or a spotter and keep the upper back anchored."]),
  "Dumbbell Bench Press": formGuide("Pectoralis major", "Triceps, front delts", "Dumbbells and bench", "Beginner", ["Sit with dumbbells on the thighs, then guide them into position.", "Plant the feet and retract the shoulder blades."], ["Lower dumbbells beside the chest with stacked wrists.", "Press them upward without forcefully clashing them.", "Keep the shoulder blades anchored."], ["Inhale on the descent.", "Exhale while pressing."], ["Dropping elbows too low.", "Wrists bending backward.", "Losing upper-back tension."], ["Use a controlled setup and return the dumbbells to the thighs before sitting up."]),
  "Cable Fly": formGuide("Pectoralis major", "Front delts", "Dual cable station", "Beginner", ["Set handles around chest height and take a split stance.", "Keep a soft, fixed elbow bend."], ["Sweep the arms together in a wide arc.", "Pause when the hands meet in front of the chest.", "Open under control without over-stretching."], ["Exhale as the hands come together.", "Inhale while opening."], ["Turning the movement into a press.", "Letting elbows drift far behind the torso.", "Using torso momentum."], ["Keep the shoulders down and stop the stretch before the shoulder rolls forward."]),
  "Overhead Press": formGuide("Deltoids", "Triceps, upper chest", "Barbell", "Intermediate", ["Hold the bar at upper-chest height with wrists over elbows.", "Brace the glutes and trunk."], ["Move the head slightly back and press the bar vertically.", "Finish with arms beside the ears.", "Lower to the upper chest under control."], ["Inhale and brace before pressing.", "Exhale near lockout."], ["Overarching the lower back.", "Pressing around the face.", "Letting wrists fold back."], ["Keep ribs stacked over the pelvis; reduce load if the back arches."]),
  "Dumbbell Shoulder Press": formGuide("Deltoids", "Triceps", "Dumbbells and bench", "Beginner", ["Set the bench upright and place feet firmly.", "Start with dumbbells near shoulder height and forearms vertical."], ["Press up until the arms are nearly straight.", "Keep forearms under the weights.", "Lower to a comfortable shoulder depth."], ["Exhale while pressing.", "Inhale while lowering."], ["Arching away from the bench.", "Clashing dumbbells overhead.", "Dropping elbows too far below the shoulders."], ["Keep the back supported and use a controlled range that feels stable."]),
  "Lateral Raise": formGuide("Side deltoids", "Upper trapezius", "Dumbbells", "Beginner", ["Stand tall with light dumbbells beside the thighs.", "Keep elbows softly bent and shoulders down."], ["Raise the elbows out to roughly shoulder height.", "Lead with the elbows rather than the hands.", "Lower slowly to the sides."], ["Exhale while raising.", "Inhale while lowering."], ["Shrugging.", "Swinging the torso.", "Raising far above shoulder height."], ["Use a light load that allows the shoulders to remain down and controlled."]),
  "Dumbbell Curl": formGuide("Biceps brachii", "Brachialis, forearms", "Dumbbells", "Beginner", ["Stand tall with arms by the sides and palms forward.", "Keep elbows close to the ribs."], ["Curl the dumbbells without moving the upper arms.", "Squeeze briefly, then lower to full elbow extension."], ["Exhale while curling.", "Inhale while lowering."], ["Swinging the torso.", "Elbows drifting forward.", "Dropping the weights quickly."], ["Keep wrists straight and use a load you can lower under control."]),
  "Hammer Curl": formGuide("Brachialis and biceps", "Brachioradialis, forearms", "Dumbbells", "Beginner", ["Stand tall with palms facing inward.", "Keep elbows beside the torso and wrists neutral."], ["Curl while maintaining the neutral grip.", "Keep upper arms still.", "Lower until the elbows extend without losing wrist position."], ["Exhale on the curl.", "Inhale on the descent."], ["Rocking the torso.", "Bending the wrists.", "Letting elbows travel forward."], ["Choose a load that keeps the wrists neutral throughout."]),
  "Preacher Curl": formGuide("Biceps brachii", "Brachialis, forearms", "Preacher bench and EZ bar or dumbbell", "Beginner", ["Adjust the seat so the upper arms rest fully on the pad.", "Begin with elbows nearly extended, not forcefully locked."], ["Curl while keeping the upper arms on the pad.", "Pause near the top without lifting the shoulders.", "Lower slowly to a comfortable extension."], ["Exhale while curling.", "Inhale while lowering."], ["Lifting elbows from the pad.", "Dropping into the bottom.", "Using too much load."], ["Control the stretched bottom position and avoid snapping the elbows straight."]),
  "Tricep Pushdown": formGuide("Triceps", "Forearms", "Cable station and bar or rope", "Beginner", ["Set the attachment around upper-chest height.", "Stand tall with elbows pinned beside the ribs."], ["Extend the elbows until the arms are straight.", "Keep upper arms still.", "Return until the forearms rise without shoulders rolling forward."], ["Exhale while pressing down.", "Inhale while returning."], ["Elbows drifting forward.", "Leaning bodyweight onto the handle.", "Shrugging."], ["Use a load that allows full elbow control without torso movement."]),
  "Overhead Tricep Extension": formGuide("Triceps, long head", "Forearms", "Dumbbell or cable", "Beginner", ["Brace the trunk and hold the load overhead.", "Point elbows forward without forcing them tightly together."], ["Bend the elbows to lower the load behind the head.", "Keep upper arms mostly still.", "Extend the elbows without arching the back."], ["Inhale while lowering.", "Exhale while extending."], ["Flaring elbows excessively.", "Arching the lower back.", "Moving the shoulders instead of the elbows."], ["Keep ribs down and use a pain-free shoulder position."]),
  "Squat": formGuide("Quadriceps and glutes", "Adductors, core", "Bodyweight or external load", "Beginner", ["Stand around shoulder width with toes slightly out.", "Brace the trunk and keep the whole foot planted."], ["Sit down between the hips as knees track over toes.", "Descend only as far as balance and posture allow.", "Drive the floor away to stand."], ["Inhale and brace before descending.", "Exhale as you pass the hardest part of the ascent."], ["Heels lifting.", "Knees collapsing inward.", "Losing trunk position."], ["Use a depth you can control while keeping feet planted and knees aligned."]),
  "Back Squat": formGuide("Quadriceps and glutes", "Adductors, spinal erectors, core", "Barbell and rack", "Intermediate", ["Set the bar securely across the upper back.", "Unrack with a braced trunk and stable stance."], ["Descend between the hips with knees tracking over toes.", "Keep the bar balanced over mid-foot.", "Drive upward while maintaining the brace."], ["Take a breath and brace before each rep.", "Exhale after passing the sticking point."], ["Knees collapsing inward.", "Heels lifting.", "Chest dropping faster than the hips."], ["Set rack safeties and use a load that preserves bar balance over mid-foot."]),
  "Leg Press": formGuide("Quadriceps and glutes", "Hamstrings, adductors", "Leg press machine", "Beginner", ["Place feet about shoulder width on the platform.", "Keep hips and lower back against the pad."], ["Lower the platform until knees reach a controlled depth.", "Track knees with the toes.", "Press through the whole foot without locking the knees forcefully."], ["Inhale while lowering.", "Exhale while pressing."], ["Lower back curling off the pad.", "Knees collapsing inward.", "Using a very shallow range with excessive load."], ["Stop the descent before the pelvis rolls away from the back pad."]),
  "Romanian Deadlift": formGuide("Hamstrings and glutes", "Adductors, spinal erectors", "Barbell or dumbbells", "Intermediate", ["Stand tall with the load against the thighs.", "Soften the knees and brace the trunk."], ["Push the hips back while keeping the load close to the legs.", "Descend until the hamstrings limit the hinge without rounding.", "Drive hips forward to stand tall."], ["Inhale and brace during the descent.", "Exhale as the hips extend."], ["Turning it into a squat.", "Rounding the back.", "Letting the load drift forward."], ["Choose range by hamstring tension, not by forcing the weight toward the floor."]),
  "Leg Extension": formGuide("Quadriceps", "—", "Leg extension machine", "Beginner", ["Align the machine pivot with the knee joint.", "Place the pad above the ankles and sit firmly against the backrest."], ["Extend the knees smoothly until nearly straight.", "Pause briefly, then lower without dropping the stack."], ["Exhale while extending.", "Inhale while lowering."], ["Kicking with momentum.", "Lifting the hips.", "Slamming into lockout."], ["Use a controlled range and avoid forcefully snapping the knees straight."]),
  "Leg Curl": formGuide("Hamstrings", "Calves", "Leg curl machine", "Beginner", ["Align the knee with the machine pivot.", "Position the pad just above the heels and secure the torso."], ["Curl the heels toward the glutes without lifting the hips.", "Pause, then extend the knees under control."], ["Exhale while curling.", "Inhale while returning."], ["Hips rising from the pad.", "Using momentum.", "Dropping the weight stack."], ["Adjust the machine carefully so the knee tracks its pivot throughout."]),
  "Bulgarian Split Squat": formGuide("Quadriceps and glutes", "Adductors, core", "Bench and dumbbells optional", "Intermediate", ["Place the rear foot on a bench and the front foot far enough forward for balance.", "Square the hips and brace the trunk."], ["Lower the rear knee toward the floor.", "Keep the front knee tracking over the toes.", "Drive through the front foot to rise."], ["Inhale while lowering.", "Exhale while standing."], ["Pushing mainly from the rear leg.", "Front heel lifting.", "Losing side-to-side balance."], ["Begin with bodyweight and use support until the stance is stable."]),
  "Hip Thrust": formGuide("Gluteus maximus", "Hamstrings, adductors", "Bench and barbell or machine", "Beginner", ["Place the upper back against a stable bench.", "Set feet so shins are near vertical at the top."], ["Drive through the feet and extend the hips.", "Finish with ribs down and pelvis level.", "Lower the hips under control."], ["Exhale while lifting.", "Inhale while lowering."], ["Overarching the lower back.", "Feet too far away or too close.", "Pushing through the toes."], ["Pad the load and finish by squeezing the glutes rather than extending the spine."]),
  "Plank": formGuide("Deep abdominals", "Glutes, shoulders", "Bodyweight", "Beginner", ["Place elbows under shoulders and extend the legs.", "Squeeze glutes and gently tuck the pelvis."], ["Hold a straight line from head to heels.", "Push the floor away and maintain steady tension."], ["Take slow, controlled breaths without losing the brace."], ["Hips sagging or piking.", "Holding the breath.", "Shrugging into the shoulders."], ["End the hold when spinal position or breathing can no longer be maintained."]),
  "Hanging Leg Raise": formGuide("Abdominals and hip flexors", "Grip, lats", "Pull-up bar", "Intermediate", ["Hang with an active shoulder position and legs together.", "Set the ribs down before moving the legs."], ["Raise the knees or straight legs by curling the pelvis upward.", "Pause without swinging.", "Lower until still before the next rep."], ["Exhale while raising.", "Inhale during the controlled descent."], ["Swinging for momentum.", "Only flexing at the hips.", "Losing shoulder tension."], ["Start with bent-knee raises if straight legs cause swinging or loss of control."]),
  "Cable Crunch": formGuide("Rectus abdominis", "Obliques", "Cable station and rope", "Beginner", ["Kneel facing the cable with the rope beside the head.", "Keep hips relatively fixed and ribs stacked over the pelvis."], ["Curl the ribs toward the pelvis.", "Pause in the shortened position.", "Return by extending the trunk without pulling through the arms."], ["Exhale during the crunch.", "Inhale while returning."], ["Sitting the hips back.", "Pulling with the arms.", "Moving only at the neck."], ["Use abdominal trunk flexion rather than forcing the head toward the floor."])
};
function getFormGuide(name) { const key = exerciseKey(name); const match = Object.keys(formGuides).find(item => exerciseKey(item) === key); return match ? formGuides[match] : null; }
const defaultGuide = { muscles: "—", secondary: "—", equipment: "—", difficulty: "—", setup: [], execution: [], breathing: [], mistakes: [], safety: [] };

function exerciseKey(value) { return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase(); }
function cleanExerciseDisplay(value) { const clean = String(value || "").trim().replace(/\s+/g, " "); return clean && (clean === clean.toLocaleLowerCase() || clean === clean.toLocaleUpperCase()) ? clean.toLocaleLowerCase().replace(/(^|[\s/-])\p{L}/gu, letter => letter.toLocaleUpperCase()) : clean; }
function canonicalExerciseName(value, candidates = []) { const key = exerciseKey(value); if (!key) return ""; const defaultName = exercises.find(name => exerciseKey(name) === key); if (defaultName) return defaultName; const existing = candidates.find(name => exerciseKey(name) === key); return cleanExerciseDisplay(existing || value); }
function dedupeExerciseNames(items = []) { const names = new Map(); items.forEach(item => { const display = canonicalExerciseName(item, [...names.values()]); const key = exerciseKey(display); if (key && !names.has(key)) names.set(key, display); }); return [...names.values()]; }
function sameExercise(left, right) { return !!exerciseKey(left) && exerciseKey(left) === exerciseKey(right); }
function positiveSetCount(value) { const count = Number(value); return Number.isInteger(count) && count > 0 ? count : 3; }
function normalizeDropSet(dropSet) { if (!dropSet || typeof dropSet !== "object") return null; const stages = Array.isArray(dropSet.stages) ? dropSet.stages.map(stage => ({ id: stage.id || uid(), weight: stage.weight ?? "", reps: stage.reps ?? "", restSeconds: stage.restSeconds ?? stage.rest_seconds ?? "", completed: !!stage.completed })) : []; return { stages: stages.length ? stages : [{ id: uid(), weight: "", reps: "", restSeconds: "", completed: false }] }; }
function normalizePlanExercises(items = []) { const normalized = new Map(); items.forEach(item => { const rawName = typeof item === "string" ? item : item.exercise || item.name; const exercise = canonicalExerciseName(rawName, [...normalized.values()].map(entry => entry.exercise)); const key = exerciseKey(exercise); if (key && !normalized.has(key)) normalized.set(key, { exercise, targetSets: typeof item === "string" ? 3 : positiveSetCount(item.targetSets ?? item.target_sets), ...(typeof item === "object" && item.runtimeId ? { runtimeId: item.runtimeId } : {}), ...(typeof item === "object" && item.dropSet ? { dropSet: normalizeDropSet(item.dropSet) } : {}) }); }); return [...normalized.values()]; }
function ensureWorkoutExerciseIds(items = []) { return normalizePlanExercises(items).map(item => ({ ...item, runtimeId: item.runtimeId || uid() })); }
function emptyWorkout() { return { startedAt: null, mode: "free", planId: null, planName: "", plannedExercises: [], sets: [], drafts: {} }; }
function normalizeCurrentWorkout(value) { const workout = value && typeof value === "object" ? value : {}; const plannedExercises = ensureWorkoutExerciseIds(workout.plannedExercises); const sets = Array.isArray(workout.sets) ? workout.sets.map(set => ({ ...set })) : []; const drafts = workout.drafts && typeof workout.drafts === "object" ? { ...workout.drafts } : {}; const migrateSlot = slotId => { const match = /^plan-(\d+)-(\d+)$/.exec(String(slotId || "")); if (!match) return slotId; const item = plannedExercises[Number(match[1])]; return item ? `plan-${item.runtimeId}-${Number(match[2])}` : slotId; }; sets.forEach(set => { if (set.slotId) set.slotId = migrateSlot(set.slotId); }); const migratedDrafts = Object.entries(drafts).reduce((result, [slotId, draft]) => { result[migrateSlot(slotId)] = draft; return result; }, {}); return { ...emptyWorkout(), ...workout, mode: workout.mode === "plan" || (workout.planName && plannedExercises.length) ? "plan" : "free", plannedExercises, sets, drafts: migratedDrafts }; }
let currentWorkout = emptyWorkout();
let workoutHistory = [];
let authenticatedUser = null;
let authState = "checking";
let foods = [];
let plans = [];
let favourites = [];
let editingPlanId = null;
let draftPlanExercises = [];
let editingSetId = null;
let confirmAction = null;
let lastRenderedStreak = null;
let resolvedAuthUserId;
let pendingDuplicatePlan = null;
let planSaveInFlight = false;
let guideOpenedFromWorkout = false;
let fitnessProfile = null;
let fitnessProfileLoaded = false;
let weightLogs = [];
let lastWorkoutSummary = null;
let activeWorkoutExerciseEdit = null;
let exerciseDragState = null;
const AI_COACH_SESSION_KEY = "lifttrack_ai_coach_session";
const AI_COACH_OWNER_KEY = "lifttrack_ai_coach_owner";
const AI_QUESTION_MAX_LENGTH = 1500;
const AI_HISTORY_LIMIT = 8;
let aiCoachMessages = loadAiCoachSession();
let aiCoachPending = false;

function load(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } }
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function loadAiCoachSession() { try { const value = JSON.parse(sessionStorage.getItem(AI_COACH_SESSION_KEY)); return Array.isArray(value) ? value.filter(item => ["user", "assistant"].includes(item?.role) && typeof item?.content === "string").slice(-AI_HISTORY_LIMIT) : []; } catch { return []; } }
function saveAiCoachSession() { try { sessionStorage.setItem(AI_COACH_SESSION_KEY, JSON.stringify(aiCoachMessages.slice(-AI_HISTORY_LIMIT))); } catch { /* Chat remains in memory when session storage is unavailable. */ } }
function bindAiCoachSessionToUser(userId) { try { const owner = sessionStorage.getItem(AI_COACH_OWNER_KEY); if (owner !== userId) { aiCoachMessages = []; sessionStorage.removeItem(AI_COACH_SESSION_KEY); sessionStorage.setItem(AI_COACH_OWNER_KEY, userId); } } catch { aiCoachMessages = []; } }
function localDateKey(value = new Date()) { const date = value instanceof Date ? value : new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function dateKey(date = new Date()) { return localDateKey(date); }
function todayFoods() { const today = localDateKey(); return foods.filter(food => localDateKey(food.loggedAt) === today); }
function validProteinTarget(value) { const target = Number(value); return Number.isFinite(target) && target >= 20 && target <= 500 ? target : null; }
function calculateProteinTarget(weight, goal = "maintain") { const value = Number(weight); return Number.isFinite(value) && value >= 20 && value <= 400 ? Math.round(value * (PROTEIN_FACTORS[goal] || PROTEIN_FACTORS.maintain)) : null; }
function activeProteinTarget() { if (!fitnessProfileLoaded) return null; return validProteinTarget(fitnessProfile?.proteinOverride) ?? validProteinTarget(calculateProteinTarget(fitnessProfile?.bodyWeight, fitnessProfile?.goal)) ?? DEFAULT_PROTEIN_GOAL; }
function nutritionTotals(items = todayFoods()) { return items.reduce((totals, food) => ({ protein: totals.protein + Number(food.protein) * Number(food.quantity || 1), calories: totals.calories + Number(food.calories || 0) * Number(food.quantity || 1) }), { protein: 0, calories: 0 }); }
function nutritionFeedback(total, target) { const ratio = target ? total / target : 0; if (ratio >= 1) return "Protein target reached 🎯"; if (ratio >= .75) return `Strong day — only ${Math.max(0, Math.round(target - total))} g remaining.`; if (ratio >= .5) return "You're over halfway there 💪"; if (ratio > 0) return "Good start — keep going."; return "Add your first meal to begin."; }
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
function showAuthenticationScreen() { setPrivateAppEnabled(false); document.querySelector("#appLoading").classList.add("hidden"); document.querySelector("#authGate").classList.remove("hidden"); document.querySelector("#appShell").classList.add("hidden"); document.querySelector("#appShell").setAttribute("aria-hidden", "true"); console.log("BOOT 8: loading screen hidden; authentication screen shown"); }
function showAuthenticatedApp() { setPrivateAppEnabled(true); document.querySelector("#appLoading").classList.add("hidden"); document.querySelector("#authGate").classList.add("hidden"); document.querySelector("#appShell").classList.remove("hidden"); document.querySelector("#appShell").setAttribute("aria-hidden", "false"); console.log("BOOT 8: loading screen hidden; app shell shown"); }
function withTimeout(promise, milliseconds, label) { let timeoutId; const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds); }); return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId)); }
async function safelyLoadCloudData(label, loader) { try { return await withTimeout(loader(), 12000, label); } catch (error) { console.error(`${label} failed:`, error); return false; } }
function requireAuthenticatedUser() { if (isAuthenticated()) return true; if (authState === "checking" || authState === "loading") showLoadingScreen(); else showAuthenticationScreen(); showToast("Please sign in to continue.", "error"); return false; }
function accountInitials(user) { const label = user?.email || "LT"; return label.slice(0, 2).toUpperCase(); }
function renderAccountControl(user) { const email = user?.email || "Signed in"; const initials = accountInitials(user); document.querySelector("#accountEmail").textContent = email; document.querySelector("#accountEmailShort").textContent = email; document.querySelector("#sidebarAccountEmail").textContent = email; document.querySelector("#accountInitials").textContent = initials; document.querySelector("#accountPanelInitials").textContent = initials; }
function openAccountPanel() { if (!requireAuthenticatedUser()) return; renderAccountControl(authenticatedUser); document.querySelector("#accountPanel").classList.remove("hidden"); document.querySelector("#accountPanel").setAttribute("aria-hidden", "false"); document.querySelector("#signOut").focus(); }
function closeAccountPanel() { document.querySelector("#accountPanel").classList.add("hidden"); document.querySelector("#accountPanel").setAttribute("aria-hidden", "true"); }

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
  ["planName", "planExerciseName", "planExerciseSets", "addPlanExercise", "savePlan", "cancelPlanEdit", "toggleFavourite"].forEach(id => {
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
  console.log("BOOT 6: updateAuthUI starting", { hasUser: !!user?.id });
  const userId = user?.id || null;
  if (resolvedAuthUserId === userId && ((userId && isAuthenticated()) || (!userId && authState === "signed_out"))) return;
  if (editingPlanId) cancelPlanEdit();
  if (user) {
    bindAiCoachSessionToUser(userId);
    authState = "loading";
    authenticatedUser = user;
    showLoadingScreen("Loading your cloud training data…");
    workoutHistory = []; foods = []; plans = []; favourites = []; fitnessProfile = null; fitnessProfileLoaded = false; weightLogs = [];
    let profileLoaded = false; let results = [];
    try {
      profileLoaded = await safelyLoadCloudData("Fitness profile", () => loadFitnessProfile({ quiet: true }));
      if (!fitnessProfileLoaded) fitnessProfileLoaded = true;
      results = await Promise.all([safelyLoadCloudData("Workout history", () => loadSupabaseWorkoutHistory({ quiet: true })), safelyLoadCloudData("Nutrition", () => loadSupabaseNutrition({ quiet: true })), safelyLoadCloudData("Workout plans", () => loadSupabasePlans({ quiet: true })), safelyLoadCloudData("Favourites", () => loadSupabaseFavourites({ quiet: true })), safelyLoadCloudData("Weight history", () => loadWeightLogs({ quiet: true }))]);
      if (authenticatedUser?.id !== userId) return;
      currentWorkout = normalizeCurrentWorkout(load(KEYS.current, emptyWorkout()));
      initializeSelectors();
      authState = "authenticated";
      resolvedAuthUserId = userId;
      renderAccountControl(user);
      ensureWorkoutLoggerAvailable(); ensureNutritionTrackerAvailable(); ensurePlansAvailable();
      renderAll();
      showView("dashboard");
    } catch (error) {
      console.error("Authenticated app startup failed:", error);
      results.push(false);
    } finally {
      if (authenticatedUser?.id === userId) {
        fitnessProfileLoaded = true;
        authState = "authenticated";
        resolvedAuthUserId = userId;
        showAuthenticatedApp();
      }
    }
    if (!profileLoaded || results.some(result => !result)) showToast("Some cloud data could not be loaded. You can keep using LiftTrack and retry later.", "error");
    console.log("BOOT 7: auth/profile data completed", { profileLoaded, optionalLoads: results });
  } else {
    authState = "signed_out";
    authenticatedUser = null;
    currentWorkout = emptyWorkout();
    editingSetId = null;
    workoutHistory = []; foods = []; plans = []; favourites = []; fitnessProfile = null; fitnessProfileLoaded = false; weightLogs = [];
    closeConfirmation(); closePersonalRecords(); closeAccountPanel();
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
  const signOutRequest = supabaseClient.auth.signOut();
  await updateAuthUI(null);
  const { error } = await signOutRequest;
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
    let { data: setRows, error: setsError } = await supabaseClient.from("workout_sets").select("id, workout_id, exercise, weight, reps, set_type, drop_position, rest_seconds, created_at").order("created_at", { ascending: true });
    if (setsError && /(set_type|drop_position|rest_seconds)/i.test(setsError.message || "")) ({ data: setRows, error: setsError } = await supabaseClient.from("workout_sets").select("id, workout_id, exercise, weight, reps, created_at").order("created_at", { ascending: true }));
    if (setsError) {
      if (!quiet) showToast(`Could not load workout sets: ${setsError.message}`, "error");
      return false;
    }
    sets = setRows;
  }
  const setsByWorkout = new Map();
  sets.forEach(set => {
    if (!setsByWorkout.has(set.workout_id)) setsByWorkout.set(set.workout_id, []);
    setsByWorkout.get(set.workout_id).push({ id: set.id, exercise: set.exercise, weight: Number(set.weight), reps: Number(set.reps), setType: set.set_type || "working", dropPosition: set.drop_position ? Number(set.drop_position) : null, restSeconds: set.rest_seconds === null || set.rest_seconds === undefined ? null : Number(set.rest_seconds), createdAt: set.created_at });
  });
  workoutHistory = sessions.map(session => ({ id: session.id, name: session.name || "Workout", startedAt: session.completed_at, finishedAt: session.completed_at, totalVolume: Number(session.total_volume), source: "supabase", sets: setsByWorkout.get(session.id) || [] }));
  renderHistoryViews();
  return true;
}

async function loadSupabaseNutrition({ quiet = false } = {}) {
  if (!authenticatedUser || !requireSupabaseConfig()) return false;
  const recentStart = new Date(); recentStart.setHours(0, 0, 0, 0); recentStart.setDate(recentStart.getDate() - 13);
  let { data, error } = await supabaseClient.from("nutrition_logs").select("id, food_name, protein, calories, quantity, logged_at").gte("logged_at", recentStart.toISOString()).order("logged_at", { ascending: false });
  if (error && /calories/i.test(error.message || "")) ({ data, error } = await supabaseClient.from("nutrition_logs").select("id, food_name, protein, quantity, logged_at").gte("logged_at", recentStart.toISOString()).order("logged_at", { ascending: false }));
  if (error) {
    if (!quiet) showToast(`Could not load nutrition data: ${error.message}`, "error");
    return false;
  }
  foods = data.map(row => ({ id: row.id, name: row.food_name, protein: Number(row.protein), calories: Number(row.calories || 0), quantity: Number(row.quantity), loggedAt: row.logged_at, source: "supabase" }));
  renderNutrition();
  renderDashboard();
  return true;
}

async function loadFitnessProfile({ quiet = false } = {}) { fitnessProfileLoaded = false; try { const { data, error } = await supabaseClient.from("fitness_profiles").select("body_weight_kg, goal, protein_target_override").maybeSingle(); if (error) { if (!quiet) showToast(`Profile could not be loaded: ${error.message}`, "error"); return false; } fitnessProfile = data ? { bodyWeight: Number(data.body_weight_kg), goal: data.goal, proteinOverride: validProteinTarget(data.protein_target_override) } : null; return true; } catch (error) { if (!quiet) showToast(`Profile could not be loaded: ${error.message}`, "error"); return false; } finally { fitnessProfileLoaded = true; renderProfile(); renderNutrition(); renderDashboard(); } }
async function saveFitnessProfile() { if (!requireAuthenticatedUser()) return; const bodyWeight = Number(document.querySelector("#profileWeight").value); const goal = document.querySelector("#profileGoal").value; const overrideValue = document.querySelector("#profileProteinOverride").value; const proteinOverride = overrideValue ? Number(overrideValue) : null; if (bodyWeight < 20 || bodyWeight > 400 || (proteinOverride !== null && (proteinOverride < 20 || proteinOverride > 500))) return showToast("Enter a valid body weight and protein target.", "error"); const { data: { user }, error: userError } = await supabaseClient.auth.getUser(); if (userError || !user) return showToast("Your session expired. Sign in again.", "error"); const { error } = await supabaseClient.from("fitness_profiles").upsert({ user_id: user.id, body_weight_kg: bodyWeight, goal, protein_target_override: proteinOverride, updated_at: new Date().toISOString() }, { onConflict: "user_id" }); if (error) return showToast(`Profile was not saved: ${error.message}`, "error"); fitnessProfile = { bodyWeight, goal, proteinOverride }; fitnessProfileLoaded = true; renderProfile(); renderNutrition(); renderDashboard(); showToast("Fitness profile updated."); }
function renderProfile() { const weight = fitnessProfile?.bodyWeight || ""; const goal = fitnessProfile?.goal || "build"; document.querySelector("#profileWeight").value = weight; document.querySelector("#profileGoal").value = goal; document.querySelector("#profileProteinOverride").value = fitnessProfile?.proteinOverride || ""; document.querySelector("#suggestedProtein").textContent = weight ? `${calculateProteinTarget(weight, goal)} g/day` : "Add body weight"; if (!document.querySelector("#weightLogDate").value) document.querySelector("#weightLogDate").value = localDateKey(); renderWeightTracking(); }
async function loadWeightLogs({ quiet = false } = {}) { const { data, error } = await supabaseClient.from("body_weight_logs").select("id, weight_kg, measured_on, created_at").order("measured_on", { ascending: false }).order("created_at", { ascending: false }).limit(30); if (error) { if (!quiet) showToast(`Weight history could not be loaded: ${error.message}`, "error"); return false; } weightLogs = data.map(row => ({ id: row.id, weight: Number(row.weight_kg), date: row.measured_on, createdAt: row.created_at })); renderWeightTracking(); return true; }
async function logBodyWeight() { if (!requireAuthenticatedUser()) return; const weight = Number(document.querySelector("#weightLogValue").value); const date = document.querySelector("#weightLogDate").value || localDateKey(); if (weight < 20 || weight > 400) return showToast("Enter a valid body weight.", "error"); const { data: { user }, error: userError } = await supabaseClient.auth.getUser(); if (userError || !user) return showToast("Your session expired. Sign in again.", "error"); const { error } = await supabaseClient.from("body_weight_logs").insert({ user_id: user.id, weight_kg: weight, measured_on: date }); if (error) return showToast(`Weight was not saved: ${error.message}`, "error"); document.querySelector("#weightLogValue").value = ""; await loadWeightLogs({ quiet: true }); showToast("Weight logged."); }
function calculateWeightChange(logs = weightLogs) { return logs.length > 1 ? Number((logs[0].weight - logs[1].weight).toFixed(1)) : null; }
function renderWeightTracking() { const current = weightLogs[0]; const previous = weightLogs[1]; const change = calculateWeightChange(); document.querySelector("#currentWeight").textContent = current ? `${current.weight.toFixed(1)} kg` : "—"; document.querySelector("#previousWeight").textContent = previous ? `${previous.weight.toFixed(1)} kg` : "—"; document.querySelector("#weightChange").textContent = change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)} kg`; const trend = document.querySelector("#weightTrend"); const recent = [...weightLogs].slice(0, 10).reverse(); trend.classList.toggle("empty-state", recent.length < 2); if (recent.length < 2) return trend.textContent = "Log your weight regularly to see your trend."; const min = Math.min(...recent.map(item => item.weight)); const max = Math.max(...recent.map(item => item.weight)); const range = Math.max(max - min, .5); trend.innerHTML = `<svg viewBox="0 0 300 90" role="img" aria-label="Recent body weight trend"><polyline points="${recent.map((item, index) => `${index / Math.max(1, recent.length - 1) * 280 + 10},${75 - (item.weight - min) / range * 60}`).join(" ")}"/></svg><small>${recent[0].weight.toFixed(1)} → ${recent[recent.length - 1].weight.toFixed(1)} kg · neutral trend view</small>`; }
// Future flow: browser upload -> authenticated serverless function -> vision/nutrition API -> structured estimate -> user confirmation -> nutrition_logs. Never expose the provider secret in frontend code.
async function estimateMealFromImage(_file) { return { available: false, reason: "Not configured. A future secure backend must call the vision/nutrition service; secret API keys must never be placed in this browser." }; }

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
    const { data, error } = await supabaseClient.from("workout_plan_exercises").select("id, workout_plan_id, exercise, position, target_sets").order("position", { ascending: true });
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
    exercisesByPlan.get(row.workout_plan_id).push({ exercise: row.exercise, targetSets: positiveSetCount(row.target_sets) });
  });
  plans = planRows.map(plan => ({ id: plan.id, name: plan.name, createdAt: plan.created_at || null, updatedAt: plan.updated_at || null, exercises: exercisesByPlan.get(plan.id) || [], source: "supabase" }));
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
  favourites = dedupeExerciseNames(data.map(row => row.exercise));
  renderFavourites();
  return true;
}

async function initializeSupabase() {
  authState = "checking"; showLoadingScreen();
  try {
    await initializeSupabaseClient();
    console.log("BOOT 4: checking session");
    const { data, error } = await withTimeout(supabaseClient.auth.getSession(), 10000, "Session check");
    if (error) throw error;
    console.log("BOOT 5: session resolved", { hasSession: !!data.session });
    await updateAuthUI(data.session?.user ?? null);
  } catch (error) {
    console.error("Supabase startup failed:", error);
    authState = "signed_out"; authenticatedUser = null; resolvedAuthUserId = null;
    showAuthenticationScreen();
    showToast(`Could not restore your session: ${error.message}`, "error");
  } finally {
    if (authState === "checking" || authState === "loading") {
      authState = authenticatedUser?.id ? "authenticated" : "signed_out";
      if (authState === "authenticated") showAuthenticatedApp(); else showAuthenticationScreen();
    }
  }
  if (supabaseClient) supabaseClient.auth.onAuthStateChange((_event, session) => { updateAuthUI(session?.user ?? null).catch(error => { console.error("Auth state update failed:", error); authState = session?.user ? "authenticated" : "signed_out"; if (session?.user) showAuthenticatedApp(); else showAuthenticationScreen(); }); });
}
function askConfirmation(message, action, label = "Delete", cancelLabel = "Cancel") { confirmAction = action; document.querySelector("#confirmMessage").textContent = message; document.querySelector("#confirmOkay").textContent = label; document.querySelector("#confirmCancel").textContent = cancelLabel; document.querySelector("#confirmModal").classList.add("open"); document.querySelector("#confirmModal").setAttribute("aria-hidden", "false"); }
function closeConfirmation() { confirmAction = null; document.querySelector("#confirmCancel").textContent = "Cancel"; document.querySelector("#confirmModal").classList.remove("open"); document.querySelector("#confirmModal").setAttribute("aria-hidden", "true"); }

function showView(name) { if (!requireAuthenticatedUser()) return; if (name === "workout") ensureWorkoutLoggerAvailable(); if (name === "nutrition") ensureNutritionTrackerAvailable(); if (name === "plans") ensurePlansAvailable(); document.querySelectorAll(".view").forEach(view => view.classList.remove("active")); document.querySelector(`#${name}View`).classList.add("active"); document.querySelectorAll(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === name)); document.querySelector("#pageTitle").textContent = ({ dashboard: "Dashboard", workout: "Workout logger", nutrition: "Nutrition", plans: "Workout plans", analytics: "Analytics", guide: "Form guide", aiCoach: "AI Coach", settings: "Fitness profile" })[name]; document.querySelector(".sidebar").classList.remove("open"); window.scrollTo({ top: 0, behavior: "smooth" }); if (name === "analytics") { renderAnalytics(); renderPersonalRecords(); renderWeeklyActivity(); } if (name === "settings") renderProfile(); if (name === "aiCoach") { renderAiCoach(); document.querySelector("#aiCoachInput").focus(); } }

function renderExerciseSelectors() {
  const workoutSelect = document.querySelector("#exerciseSelect");
  const guideSelect = document.querySelector("#guideExercise");
  const selectedWorkout = workoutSelect.value;
  const selectedGuide = guideSelect.value;
  const planNames = plans.flatMap(plan => normalizePlanExercises(plan.exercises).map(item => item.exercise));
  const allAvailable = dedupeExerciseNames([...favourites, ...planNames, ...exercises]);
  const workoutAvailable = currentWorkout.mode === "plan" ? dedupeExerciseNames(normalizePlanExercises(currentWorkout.plannedExercises).map(item => item.exercise)) : allAvailable;
  renderCategorizedOptions(workoutSelect, workoutAvailable, document.querySelector("#exerciseSearch")?.value || "");
  renderCategorizedOptions(guideSelect, allAvailable);
  document.querySelector("#exerciseOptions").innerHTML = allAvailable.map(name => `<option value="${escapeHTML(name)}"></option>`).join("");
  if (workoutAvailable.includes(selectedWorkout)) workoutSelect.value = selectedWorkout;
  if (allAvailable.includes(selectedGuide)) guideSelect.value = selectedGuide;
  document.querySelector("#exercisePickerValue").textContent = workoutSelect.value || "Choose exercise";
  renderExerciseBrowser(document.querySelector("#workoutExerciseResults"), workoutAvailable, document.querySelector("#exerciseSearch").value, "workout");
  renderExerciseBrowser(document.querySelector("#planExerciseResults"), allAvailable, document.querySelector("#planExerciseName").value, "plan");
}
function renderCategorizedOptions(select, names, query = "") {
  const selected = select.value;
  const normalizedQuery = exerciseKey(query);
  const visible = dedupeExerciseNames(names).filter(name => !normalizedQuery || exerciseKey(name).includes(normalizedQuery) || exerciseKey(exerciseCategory(name)).includes(normalizedQuery));
  const groups = new Map();
  visible.forEach(name => { const category = favourites.some(item => sameExercise(item, name)) ? "★ Favourites" : exerciseCategory(name); if (!groups.has(category)) groups.set(category, []); groups.get(category).push(name); });
  const order = ["★ Favourites", ...Object.keys(EXERCISE_CATEGORIES), "Custom"];
  select.innerHTML = order.filter(category => groups.has(category)).map(category => `<optgroup label="${escapeHTML(category.toUpperCase())}">${groups.get(category).sort((a, b) => a.localeCompare(b)).map(name => `<option>${escapeHTML(name)}</option>`).join("")}</optgroup>`).join("") || `<option disabled>No exercises found</option>`;
  if (visible.some(name => sameExercise(name, selected))) select.value = visible.find(name => sameExercise(name, selected));
}
function groupedExerciseResults(names, query = "") {
  const normalizedQuery = exerciseKey(query); const unique = dedupeExerciseNames(names);
  const visible = unique.filter(name => !normalizedQuery || exerciseKey(name).includes(normalizedQuery) || exerciseKey(exerciseCategory(name)).includes(normalizedQuery));
  const groups = new Map();
  visible.forEach(name => { const category = favourites.some(item => sameExercise(item, name)) ? "★ Favourites" : exerciseCategory(name); if (!groups.has(category)) groups.set(category, []); groups.get(category).push(name); });
  return ["★ Favourites", ...Object.keys(EXERCISE_CATEGORIES), "Custom"].filter(category => groups.has(category)).map(category => ({ category, exercises: groups.get(category).sort((a, b) => a.localeCompare(b)) }));
}
function renderExerciseBrowser(container, names, query = "", target = "workout") {
  const groups = groupedExerciseResults(names, query);
  container.innerHTML = groups.length ? groups.map(group => `<section class="exercise-result-group"><h4>${escapeHTML(group.category.toUpperCase())}</h4>${group.exercises.map(name => `<button type="button" role="option" data-select-exercise="${encodeURIComponent(name)}" data-exercise-target="${target}"${target === "workout" && sameExercise(document.querySelector("#exerciseSelect").value, name) ? ` aria-selected="true"` : ""}><span>${escapeHTML(name)}</span><small>${escapeHTML(exerciseCategory(name))}</small></button>`).join("")}</section>`).join("") : `<p class="exercise-no-results">No exercises match “${escapeHTML(query)}”.</p>`;
}
function toggleWorkoutExercisePicker(force) { const panel = document.querySelector("#exercisePickerPanel"); const open = typeof force === "boolean" ? force : panel.classList.contains("hidden"); panel.classList.toggle("hidden", !open); document.querySelector("#exercisePickerButton").setAttribute("aria-expanded", String(open)); if (open) { renderExerciseSelectors(); document.querySelector("#exerciseSearch").focus(); } }
function selectExerciseFromBrowser(name, target) { const exercise = canonicalExerciseName(name, exercises); if (target === "active-workout") { activeWorkoutExerciseEdit.selectedExercise = exercise; renderStructuredWorkout(); return; } if (target === "plan") { document.querySelector("#planExerciseName").value = exercise; document.querySelector("#planExerciseResults").classList.add("hidden"); document.querySelector("#planExerciseSets").focus(); return; } const select = document.querySelector("#exerciseSelect"); const option = [...select.options].find(item => sameExercise(item.value, exercise)); if (option) select.value = option.value; document.querySelector("#exercisePickerValue").textContent = select.value; document.querySelector("#exerciseSearch").value = ""; toggleWorkoutExercisePicker(false); renderFavourites(); }
function initializeSelectors() { renderExerciseSelectors(); }
function renderAll() { renderDashboard(); renderWorkout(); renderNutrition(); renderPlans(); renderFavourites(); renderAnalytics(); renderPersonalRecords(); renderWeeklyActivity(); renderGuide(); renderProfile(); renderAiCoach(); }

function compactSet(set) { const weight = Number(set?.weight); const reps = Number(set?.reps); return Number.isFinite(weight) && Number.isFinite(reps) && reps > 0 ? `${weight}×${reps}` : null; }
function buildAiCoachContext(question) {
  const planExercises = normalizePlanExercises(currentWorkout.plannedExercises).slice(0, 8);
  const exerciseContext = planExercises.map(item => { const completed = currentWorkout.sets.filter(set => set.setType !== "drop" && sameExercise(set.exercise, item.exercise)).map(compactSet).filter(Boolean).slice(-5); return { name: item.exercise, prescribedSets: item.targetSets, completed }; });
  const previous = workoutHistory.find(workout => (!currentWorkout.planName || workout.name === currentWorkout.planName) && workout.sets?.length);
  const previousPerformance = previous ? [...new Set(previous.sets.map(set => set.exercise))].slice(0, 5).map(exercise => ({ exercise, sets: previous.sets.filter(set => sameExercise(set.exercise, exercise) && set.setType !== "drop").map(compactSet).filter(Boolean).slice(-4) })) : [];
  const lowerQuestion = question.toLocaleLowerCase();
  return {
    goal: fitnessProfile?.goal || null,
    ...(fitnessProfileLoaded && /weight|protein|nutrition|calorie|diet/.test(lowerQuestion) && Number.isFinite(Number(fitnessProfile?.bodyWeight)) ? { bodyWeightKg: Number(fitnessProfile.bodyWeight), activeProteinTargetG: activeProteinTarget() } : {}),
    currentWorkout: currentWorkout.startedAt || currentWorkout.sets.length || planExercises.length ? { name: currentWorkout.planName || "Open workout", exercises: exerciseContext, dropSetsUsed: planExercises.some(item => item.dropSet?.stages?.length) } : null,
    previousPerformance
  };
}
function renderAiCoach() {
  const list = document.querySelector("#aiCoachMessages"); if (!list) return;
  const visible = [{ role: "assistant", content: "Hey! What can I help you with today?" }, ...aiCoachMessages];
  list.innerHTML = visible.map(message => `<div class="ai-message ${message.role}"><strong>${message.role === "user" ? "You" : "AI Coach"}</strong><p>${escapeHTML(message.content)}</p></div>`).join("") + (aiCoachPending ? `<div class="ai-message assistant thinking"><strong>AI Coach</strong><p>AI Coach is thinking…</p></div>` : "");
  document.querySelector("#aiCoachPrompts").classList.toggle("hidden", aiCoachMessages.length > 0);
  document.querySelector("#aiCoachSend").disabled = aiCoachPending;
  document.querySelector("#aiCoachInput").disabled = aiCoachPending;
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
}
function clearAiCoachConversation() { if (aiCoachPending) return; aiCoachMessages = []; saveAiCoachSession(); renderAiCoach(); document.querySelector("#aiCoachInput").focus(); }
function aiCoachErrorMessage(status, code) {
  if (status === 401) return "Your session expired. Sign in again to use AI Coach.";
  if (status === 429) return "You’re asking a little quickly. Wait a moment and try again.";
  if (code === "timeout") return "AI Coach took too long to respond. Please try again.";
  if (!navigator.onLine) return "You’re offline. Reconnect to use AI Coach.";
  return "AI Coach couldn't respond right now. Please try again.";
}
async function submitAiCoachQuestion(rawQuestion) {
  const question = String(rawQuestion ?? document.querySelector("#aiCoachInput").value).trim();
  if (aiCoachPending) return;
  if (!question) return showToast("Ask AI Coach a question first.", "error");
  if (question.length > AI_QUESTION_MAX_LENGTH) return showToast(`Keep your question under ${AI_QUESTION_MAX_LENGTH.toLocaleString()} characters.`, "error");
  if (!navigator.onLine) return showToast("You’re offline. Reconnect to use AI Coach.", "error");
  const previousHistory = aiCoachMessages.slice(-6);
  aiCoachMessages = [...aiCoachMessages, { role: "user", content: question }].slice(-AI_HISTORY_LIMIT);
  document.querySelector("#aiCoachInput").value = ""; aiCoachPending = true; saveAiCoachSession(); renderAiCoach();
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const { data, error: sessionError } = await supabaseClient.auth.getSession(); const token = data?.session?.access_token;
    if (sessionError || !token) { const authError = new Error("Session unavailable"); authError.status = 401; throw authError; }
    const response = await fetch("/api/ai-coach", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ question, history: previousHistory, context: buildAiCoachContext(question) }), signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { const requestError = new Error("AI Coach request failed"); requestError.status = response.status; requestError.code = result.code; throw requestError; }
    if (typeof result.answer !== "string" || !result.answer.trim()) throw new Error("Empty AI Coach response");
    aiCoachMessages = [...aiCoachMessages, { role: "assistant", content: result.answer.trim() }].slice(-AI_HISTORY_LIMIT); saveAiCoachSession();
  } catch (error) {
    const code = error.name === "AbortError" ? "timeout" : error.code; aiCoachMessages = [...aiCoachMessages, { role: "assistant", content: aiCoachErrorMessage(error.status, code) }].slice(-AI_HISTORY_LIMIT); saveAiCoachSession();
  } finally { clearTimeout(timeout); aiCoachPending = false; renderAiCoach(); }
}

function renderDashboard() {
  const now = new Date(); const hour = now.getHours(); const name = cleanExerciseDisplay((authenticatedUser?.user_metadata?.full_name || authenticatedUser?.email?.split("@")[0] || "").split(/[._-]/)[0]); document.querySelector("#greeting").textContent = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}${name ? `, ${name}` : ""}.`;
  const messages = ["Small improvements stack up.", "Train with purpose today.", "Consistency beats intensity.", "One session closer to your goals.", "Build strength one set at a time."]; document.querySelector("#heroMotivation").textContent = messages[(now.getDate() + now.getDay()) % messages.length];
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
  const setCount = currentWorkout.sets.length; const completedToday = workoutHistory.some(workout => localDateKey(workout.finishedAt) === localDateKey()); document.querySelector("#dashWorkoutStatus").textContent = setCount ? "In progress" : completedToday ? "Complete ✓" : "Not started"; document.querySelector("#dashWorkoutDetail").textContent = setCount ? `${setCount} set${setCount === 1 ? "" : "s"} logged` : completedToday ? "Today's workout is saved" : "Ready for your next session";
  const protein = nutritionTotals().protein; const proteinTarget = activeProteinTarget(); document.querySelector("#dashProtein").textContent = formatNumber(protein); document.querySelector("#dashProtein").nextElementSibling.textContent = proteinTarget === null ? " / —g" : ` / ${proteinTarget}g`; document.querySelector("#dashProteinBar").style.width = proteinTarget === null ? "0%" : `${Math.min(protein / proteinTarget * 100, 100)}%`;
  const allSets = workoutHistory.flatMap(workout => workout.sets); const best = allSets.filter(set => set.setType !== "drop").sort((a, b) => epley(b.weight, b.reps) - epley(a.weight, a.reps))[0]; document.querySelector("#dashBest1rm").textContent = best ? `${formatNumber(epley(best.weight, best.reps))} kg` : "—"; document.querySelector("#dashBestExercise").textContent = best ? best.exercise : "Log sets to establish a best";
  const last = workoutHistory[0]; document.querySelector("#lastWorkout").innerHTML = last ? `<div class="history-card"><div><strong>${escapeHTML(last.name || "Workout")}</strong><small>${formatDate(last.finishedAt)}</small></div><div><strong>${last.sets.length}</strong><small>sets</small></div><div><strong>${formatNumber(workoutVolume(last))} kg</strong><small>volume</small></div><div><strong>${new Set(last.sets.map(set => set.exercise)).size}</strong><small>exercises</small></div></div>` : "No completed workouts yet. Your first session will appear here.";
  const currentStreak = calculateCurrentStreak(workoutHistory); const bestStreak = calculateLongestStreak(workoutHistory); document.querySelector("#currentStreak").textContent = currentStreak; document.querySelector("#currentStreakUnit").textContent = ` ${workoutDayUnit(currentStreak)}`; document.querySelector("#bestStreakText").textContent = formatWorkoutDays(bestStreak); const streakCard = document.querySelector("#streakCard"); if (lastRenderedStreak !== null && currentStreak > lastRenderedStreak) { streakCard.classList.remove("streak-increased"); void streakCard.offsetWidth; streakCard.classList.add("streak-increased"); } lastRenderedStreak = currentStreak;
  streakCard.title = currentStreak ? "Keep the streak alive." : "Your next streak starts here.";
}

function beginPlanWorkout(plan) {
  activeWorkoutExerciseEdit = null;
  currentWorkout = { ...emptyWorkout(), startedAt: new Date().toISOString(), mode: "plan", planId: plan.id, planName: plan.name, plannedExercises: ensureWorkoutExerciseIds(plan.exercises), sets: [] };
  save(KEYS.current, currentWorkout); renderExerciseSelectors(); renderWorkout(); renderFavourites(); showView("workout"); showToast(`${plan.name} started`);
}
function startWorkout(plan = null) {
  if (!requireAuthenticatedUser()) return;
  if (plan) {
    if (currentWorkout.mode === "plan" && currentWorkout.planId === plan.id && currentWorkout.startedAt) { renderExerciseSelectors(); renderWorkout(); showView("workout"); return showToast(`${plan.name} resumed`); }
    if (currentWorkout.sets.length) return askConfirmation("You already have a workout in progress. Start this plan and replace it?", () => { closeConfirmation(); beginPlanWorkout(plan); }, "Start Plan", "Keep Workout");
    return beginPlanWorkout(plan);
  } else if (!currentWorkout.startedAt) {
    currentWorkout = { ...emptyWorkout(), startedAt: new Date().toISOString() };
  }
  save(KEYS.current, currentWorkout);
  renderExerciseSelectors(); renderWorkout(); renderFavourites(); showView("workout");
  showToast(currentWorkout.mode === "plan" ? `${currentWorkout.planName} resumed` : "Workout ready");
}
function addSet() { if (!requireAuthenticatedUser()) return; const exercise = document.querySelector("#exerciseSelect").value; const weight = Number(document.querySelector("#weightInput").value); const reps = Number(document.querySelector("#repsInput").value); if (!weight || weight <= 0 || !Number.isInteger(reps) || reps <= 0) return showToast("Enter a valid weight and whole-number reps.", "error"); if (!currentWorkout.startedAt) currentWorkout.startedAt = new Date().toISOString(); const existing = editingSetId ? currentWorkout.sets.find(set => set.id === editingSetId) : null; if (existing) Object.assign(existing, { exercise, weight, reps }); else currentWorkout.sets.push({ id: uid(), exercise, weight, reps, createdAt: new Date().toISOString() }); const message = existing ? `${exercise} set updated` : `${exercise} set added`; editingSetId = null; document.querySelector("#addSet").textContent = "Add set"; save(KEYS.current, currentWorkout); document.querySelector("#repsInput").value = ""; renderWorkout(); renderDashboard(); showToast(message); }
function editSet(id) { if (!requireAuthenticatedUser()) return; const set = currentWorkout.sets.find(item => item.id === id); if (!set) return; editingSetId = id; document.querySelector("#exerciseSelect").value = set.exercise; document.querySelector("#exercisePickerValue").textContent = set.exercise; document.querySelector("#weightInput").value = set.weight; document.querySelector("#repsInput").value = set.reps; document.querySelector("#addSet").textContent = "Update set"; document.querySelector("#weightInput").focus(); }
function deleteSet(id) { if (!requireAuthenticatedUser()) return; currentWorkout.sets = currentWorkout.sets.filter(set => set.id !== id); if (editingSetId === id) { editingSetId = null; document.querySelector("#addSet").textContent = "Add set"; } if (!currentWorkout.sets.length && currentWorkout.mode !== "plan") currentWorkout.startedAt = null; save(KEYS.current, currentWorkout); renderWorkout(); renderDashboard(); showToast("Set removed"); }
function volumeOf(sets) { return sets.reduce((sum, set) => sum + set.weight * set.reps, 0); }
function workoutVolume(workout) { return Number.isFinite(workout.totalVolume) ? workout.totalVolume : volumeOf(workout.sets); }
function bestEstimated1RMs(sets) {
  return sets.filter(set => set.setType !== "drop").reduce((bests, set) => {
    const estimate = epley(Number(set.weight), Number(set.reps));
    const exercise = canonicalExerciseName(set.exercise, Object.keys(bests));
    if (Number.isFinite(estimate) && estimate > (bests[exercise] || 0)) bests[exercise] = estimate;
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
  let { data, error } = await supabaseClient.from("workout_sets").select("exercise, weight, reps, set_type");
  if (error && /set_type/i.test(error.message || "")) ({ data, error } = await supabaseClient.from("workout_sets").select("exercise, weight, reps"));
  if (error) throw error;
  return (data || []).map(set => ({ ...set, setType: set.set_type || "working" }));
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
  currentWorkout = emptyWorkout();
  activeWorkoutExerciseEdit = null;
  editingSetId = null; document.querySelector("#addSet").textContent = "Add set";
  save(KEYS.current, currentWorkout);
}
function buildWorkoutSummary(workout, personalRecords = []) { const durationMinutes = Math.max(1, Math.round((new Date(workout.finishedAt) - new Date(workout.startedAt || workout.finishedAt)) / 60000)); const workingSets = workout.sets.filter(set => set.setType !== "drop"); const dropStages = workout.sets.filter(set => set.setType === "drop"); const exercises = new Set(workout.sets.map(set => exerciseKey(set.exercise))).size; const positions = {}; const improvements = workingSets.filter(set => { const key = exerciseKey(set.exercise); const position = positions[key] || 0; positions[key] = position + 1; const previous = previousExercisePerformance(set.exercise).sets[position]; return previous && (Number(set.weight) > Number(previous.weight) || Number(set.reps) > Number(previous.reps)); }).length; return { name: workout.name, sets: workingSets.length, dropSets: new Set(dropStages.map(set => exerciseKey(set.exercise))).size, dropStages: dropStages.length, exercises, volume: workoutVolume(workout), durationMinutes, improvements, personalRecords, streak: calculateCurrentStreak([workout, ...workoutHistory]) }; }
function showWorkoutSummary(summary) { lastWorkoutSummary = summary; document.querySelector("#workoutSummaryTitle").textContent = summary.name; document.querySelector("#workoutSummaryDetails").innerHTML = `<div><strong>${summary.sets}</strong><span>working sets</span></div><div><strong>${summary.dropStages}</strong><span>drop stages</span></div><div><strong>${formatNumber(summary.volume)} kg</strong><span>volume</span></div><div><strong>${summary.durationMinutes} min</strong><span>duration</span></div><p>${summary.exercises} exercises · ${summary.dropSets} Drop Set${summary.dropSets === 1 ? "" : "s"}</p><p>${summary.improvements} improvement${summary.improvements === 1 ? "" : "s"} · ${summary.personalRecords.length} Personal Record${summary.personalRecords.length === 1 ? "" : "s"}</p><p>🔥 Streak: ${summary.streak} ${workoutDayUnit(summary.streak)}</p>`; const modal = document.querySelector("#workoutSummaryModal"); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); }
function closeWorkoutSummary() { const summary = lastWorkoutSummary; const modal = document.querySelector("#workoutSummaryModal"); modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); lastWorkoutSummary = null; showView("dashboard"); if (summary?.personalRecords.length) showPersonalRecords(summary.personalRecords); }

async function finishAuthenticatedWorkout() {
  if (!requireAuthenticatedUser()) return;
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    showToast(userError?.message || "Your session expired. Sign in again before finishing.", "error");
    return;
  }
  const workingSets = currentWorkout.sets.map(set => ({ ...set, setType: "working" })); const completedSets = [...workingSets, ...dropStageSets()];
  const exerciseNames = [...new Set(workingSets.map(set => set.exercise))];
  let personalRecords = [];
  let prComparisonError = null;
  try {
    const previousSets = await loadPreviousSetsForExercises(exerciseNames);
    personalRecords = detectPersonalRecords(workingSets, previousSets);
  } catch (error) {
    prComparisonError = error;
  }
  const completedAt = new Date().toISOString();
  const sessionPayload = { user_id: user.id, name: currentWorkout.planName || "Workout", completed_at: completedAt, total_volume: volumeOf(completedSets) };
  const { data: session, error: sessionError } = await supabaseClient.from("workout_sessions").insert(sessionPayload).select("id").single();
  if (sessionError) {
    closeConfirmation();
    showToast("Couldn't save your workout. Your workout is still here — try again when you're online.", "error");
    return;
  }
  const hasDropStages = completedSets.some(set => set.setType === "drop"); const setRows = completedSets.map(set => ({ workout_id: session.id, user_id: user.id, exercise: set.exercise, weight: set.weight, reps: set.reps, ...(hasDropStages ? { set_type: set.setType || "working", drop_position: set.dropPosition || null, rest_seconds: set.restSeconds ?? null } : {}) }));
  const { error: setsError } = await supabaseClient.from("workout_sets").insert(setRows);
  if (setsError) {
    const { error: cleanupError } = await supabaseClient.from("workout_sessions").delete().eq("id", session.id);
    closeConfirmation();
    const cleanupMessage = cleanupError ? ` Cleanup also failed: ${cleanupError.message}` : " The incomplete session was removed.";
    const migrationMessage = /(set_type|drop_position|rest_seconds)/i.test(setsError.message || "") ? " Review and run mission-drop-sets-migration.sql before saving Drop Sets." : ""; showToast(`Couldn't save your workout sets. Your workout is still here — try again when you're online.${migrationMessage}${cleanupMessage}`, "error");
    return;
  }
  const completedWorkout = { id: session.id, name: sessionPayload.name, startedAt: currentWorkout.startedAt, finishedAt: completedAt, totalVolume: sessionPayload.total_volume, source: "supabase", sets: completedSets };
  const summary = buildWorkoutSummary(completedWorkout, personalRecords); clearCurrentWorkout();
  closeConfirmation();
  const refreshed = await loadSupabaseWorkoutHistory({ quiet: true });
  if (!refreshed) {
    workoutHistory = [completedWorkout, ...workoutHistory.filter(workout => workout.id !== session.id)];
    renderAll();
  }
  showView("dashboard");
  showToast(refreshed ? "Workout saved to Supabase." : "Workout saved, but history could not be refreshed.", refreshed ? "success" : "error");
  showWorkoutSummary(summary);
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
  const targetSets = currentWorkout.mode === "plan" ? normalizePlanExercises(currentWorkout.plannedExercises).reduce((sum, item) => sum + item.targetSets, 0) : 0;
  const completedSlots = currentWorkout.mode === "plan" ? new Set(currentWorkout.sets.filter(set => set.slotId).map(set => set.slotId)).size : 0;
  const unfinished = Math.max(0, targetSets - completedSlots);
  askConfirmation(unfinished ? `Your plan has ${unfinished} unfinished set${unfinished === 1 ? "" : "s"}. Finish workout anyway?` : "Finish and save this workout to your history?", async () => {
    await finishAuthenticatedWorkout();
  }, unfinished ? "Finish Anyway" : "Finish", unfinished ? "Continue Workout" : "Cancel");
}
function renderWorkoutHistoryDetails(workout) { const groups = workout.sets.reduce((result, set) => { const key = exerciseKey(set.exercise); result[key] ??= { exercise: set.exercise, working: [], drops: [] }; result[key][set.setType === "drop" ? "drops" : "working"].push(set); return result; }, {}); return `<details class="history-set-details"><summary>View sets</summary>${Object.values(groups).map(group => `<section><strong>${escapeHTML(group.exercise)}</strong>${group.working.length ? `<small>Working sets</small><p>${group.working.map(set => `${set.weight}×${set.reps}`).join(" · ")}</p>` : ""}${group.drops.length ? `<small>Drop Set</small><p>${group.drops.sort((a, b) => (a.dropPosition || 0) - (b.dropPosition || 0)).map(set => `${set.weight}×${set.reps}${set.restSeconds !== null ? ` · ${set.restSeconds}s rest` : ""}`).join(" ↓ ")}</p>` : ""}</section>`).join("")}</details>`; }
function renderWorkout() { const sets = currentWorkout.sets; const allSets = [...sets, ...dropStageSets()]; document.querySelector("#workoutHeading").textContent = currentWorkout.planName || "Today’s workout"; document.querySelector("#workoutStarted").textContent = currentWorkout.startedAt ? `Started ${new Date(currentWorkout.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Add your first working set to begin."; document.querySelector("#currentSets").textContent = sets.length; document.querySelector("#currentVolume").textContent = `${formatNumber(volumeOf(allSets))} kg`; const best = Math.max(0, ...sets.map(set => epley(set.weight, set.reps))); document.querySelector("#current1rm").textContent = best ? `${formatNumber(best)} kg` : "—"; document.querySelector("#sessionPill").textContent = allSets.length ? "In progress" : "Waiting"; document.querySelector("#sessionPill").classList.toggle("live", !!allSets.length); const list = document.querySelector("#currentSetList"); list.classList.toggle("empty-state", !sets.length); list.innerHTML = sets.length ? sets.map((set, index) => `<div class="set-row"><span class="set-number">${index + 1}</span><div><strong>${escapeHTML(set.exercise)}</strong><small>Exercise</small></div><div><strong>${set.weight} kg</strong><small>Weight</small></div><div><strong>${set.reps}</strong><small>Reps</small></div><div><strong>${formatNumber(epley(set.weight, set.reps))} kg</strong><small>Est. 1RM</small></div><button class="icon-btn edit-set-btn" data-edit-set="${set.id}" aria-label="Edit set">✎</button><button class="icon-btn" data-delete-set="${set.id}" aria-label="Delete set">×</button></div>`).join("") : "No sets logged yet."; const history = document.querySelector("#historyList"); history.classList.toggle("empty-state", !workoutHistory.length); history.innerHTML = workoutHistory.length ? workoutHistory.map(workout => { const workingCount = workout.sets.filter(set => set.setType !== "drop").length; const dropCount = workout.sets.filter(set => set.setType === "drop").length; return `<div class="history-workout"><div class="history-card"><div><strong>${escapeHTML(workout.name)}</strong><small>${formatDate(workout.finishedAt)}</small></div><div><strong>${workingCount}</strong><small>working sets${dropCount ? ` · ${dropCount} drops` : ""}</small></div><div><strong>${formatNumber(workoutVolume(workout))} kg</strong><small>volume</small></div><div><strong>${new Set(workout.sets.map(set => set.exercise)).size}</strong><small>exercises</small></div><button class="icon-btn" data-delete-workout="${workout.id}" aria-label="Delete workout">×</button></div>${renderWorkoutHistoryDetails(workout)}</div>`; }).join("") : "Completed workouts will be saved here."; }

const renderWorkoutBase = renderWorkout;
renderWorkout = function renderWorkoutWithMode() {
  renderWorkoutBase();
  const structured = currentWorkout.mode === "plan";
  document.querySelector("#freeWorkoutEntry").classList.toggle("hidden", structured);
  document.querySelector("#structuredWorkout").classList.toggle("hidden", !structured);
  document.querySelector("#currentSetsPanel").classList.toggle("hidden", structured);
  renderWorkoutWarmup();
  if (structured) renderStructuredWorkout();
};

function getWorkoutWarmup(planExercises = normalizePlanExercises(currentWorkout.plannedExercises)) { const categories = planExercises.map(item => exerciseCategory(item.exercise)); const legs = categories.filter(category => ["Legs", "Glutes"].includes(category)).length; const pull = categories.filter(category => ["Back", "Biceps"].includes(category)).length; const push = categories.filter(category => ["Chest", "Shoulders", "Triceps"].includes(category)).length; if (legs >= Math.max(pull, push)) return { type: "Legs", minutes: "5–7 min", cues: ["Light cardio or general movement", "Controlled hip and knee movement", "Light squat or hinge pattern before loading"] }; if (pull > push) return { type: "Pull", minutes: "5–7 min", cues: ["Light cardio or general movement", "Shoulder circles and controlled scapular movement", "1–2 light ramp-up sets for the first pulling exercise"] }; if (push) return { type: "Push", minutes: "5–7 min", cues: ["Light general movement", "Controlled shoulder and elbow preparation", "1–2 light ramp-up sets for the first press"] }; return { type: "Full body", minutes: "5–7 min", cues: ["Light general movement", "Move major joints through a controlled range", "Use a lighter version of the first exercise"] }; }
function getRampUpSets(exercise) { const previous = previousExercisePerformance(exercise).sets.find(set => Number(set.weight) > 0); if (!previous) return []; const workingWeight = Number(previous.weight); const roundLoad = value => Math.max(0, Math.round(value / 2.5) * 2.5); return [{ weight: roundLoad(workingWeight * .5), reps: 10 }, { weight: roundLoad(workingWeight * .75), reps: 6 }].filter((set, index, all) => set.weight > 0 && (!index || set.weight > all[index - 1].weight)); }
function renderWorkoutWarmup() { const card = document.querySelector("#workoutWarmup"); const structured = currentWorkout.mode === "plan"; card.classList.toggle("hidden", !structured || currentWorkout.warmupDismissed); if (!structured || currentWorkout.warmupDismissed) return; const exercises = normalizePlanExercises(currentWorkout.plannedExercises); const warmup = getWorkoutWarmup(exercises); const first = exercises[0]; const ramp = first ? getRampUpSets(first.exercise) : []; card.innerHTML = `<div class="panel-head"><div><p class="eyebrow">${warmup.type.toUpperCase()} WARM-UP</p><h3>${warmup.minutes}</h3></div><button class="text-btn" data-skip-warmup>Skip warm-up</button></div><ul>${warmup.cues.map(cue => `<li>${escapeHTML(cue)}</li>`).join("")}</ul>${ramp.length ? `<div class="ramp-up"><strong>${escapeHTML(first.exercise)} ramp-up</strong><p>${ramp.map(set => `${set.weight} kg × ${set.reps}`).join(" → ")} → working sets</p><small>Guidance only; warm-up sets are not logged.</small></div>` : ""}`; }
function skipWarmup() { currentWorkout.warmupDismissed = true; save(KEYS.current, currentWorkout); renderWorkoutWarmup(); }

function structuredSlotId(exerciseReference, setIndex) { const runtimeId = typeof exerciseReference === "number" ? ensureWorkoutExerciseIds(currentWorkout.plannedExercises)[exerciseReference]?.runtimeId : exerciseReference; return `plan-${runtimeId}-${setIndex}`; }
function previousExercisePerformance(exercise) {
  const matchingPlan = workoutHistory.find(workout => workout.name === currentWorkout.planName && workout.sets.some(set => set.setType !== "drop" && sameExercise(set.exercise, exercise)));
  const workout = matchingPlan || workoutHistory.find(item => item.sets.some(set => set.setType !== "drop" && sameExercise(set.exercise, exercise)));
  return workout ? { workout, sets: workout.sets.filter(set => set.setType !== "drop" && sameExercise(set.exercise, exercise)) } : { workout: null, sets: [] };
}
function historicalExerciseBest(exercise) { return Math.max(0, ...workoutHistory.flatMap(workout => workout.sets).filter(set => set.setType !== "drop" && sameExercise(set.exercise, exercise)).map(set => epley(Number(set.weight), Number(set.reps)))); }
function structuredSetFeedback(set, setIndex, previousSets, historicalBest) {
  const feedback = [];
  const previous = previousSets[setIndex];
  if (previous) {
    const weightChange = Number(set.weight) - Number(previous.weight); const repsChange = Number(set.reps) - Number(previous.reps);
    if (weightChange > 0 && repsChange >= 0) feedback.push(`Weight up ${weightChange} kg with reps maintained 🔥`);
    else if (!weightChange && repsChange > 0) feedback.push(`${repsChange} more rep${repsChange === 1 ? "" : "s"} than last time.`);
    else if (weightChange > 0 || repsChange > 0) feedback.push(`${weightChange > 0 ? `+${weightChange} kg` : ""}${weightChange > 0 && repsChange > 0 ? ", " : ""}${repsChange > 0 ? `+${repsChange} reps` : ""} vs last time`);
    else feedback.push("Matched previous set");
  }
  const estimate = epley(set.weight, set.reps);
  if (!historicalBest || estimate > historicalBest) feedback.push(historicalBest ? `🏆 Potential new PR: ${formatNumber(historicalBest)} → ${formatNumber(estimate)} kg` : `🏆 Potential first recorded PR: ${formatNumber(estimate)} kg`);
  if (!feedback.length) feedback.push("Set logged. Keep the next rep controlled.");
  return feedback;
}
function structuredSlotParts(slotId) { const match = /^plan-(.+)-(\d+)$/.exec(String(slotId || "")); if (!match) return null; const items = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); const exerciseIndex = items.findIndex(item => item.runtimeId === match[1]); return exerciseIndex >= 0 ? { exerciseIndex, runtimeId: match[1], setIndex: Number(match[2]) } : null; }
function persistActiveWorkoutStructure(message) { currentWorkout.plannedExercises = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); save(KEYS.current, currentWorkout); renderExerciseSelectors(); renderWorkout(); renderDashboard(); if (message) showToast(message); }
function remapStructuredSlots(mapSlot) {
  currentWorkout.sets = currentWorkout.sets.flatMap(set => { const parts = structuredSlotParts(set.slotId); if (!parts) return [set]; const mapped = mapSlot(parts); return mapped ? [{ ...set, slotId: structuredSlotId(mapped.runtimeId ?? mapped.exerciseIndex, mapped.setIndex) }] : []; });
  currentWorkout.drafts = Object.entries(currentWorkout.drafts).reduce((drafts, [slotId, draft]) => { const parts = structuredSlotParts(slotId); if (!parts) { drafts[slotId] = draft; return drafts; } const mapped = mapSlot(parts); if (mapped) drafts[structuredSlotId(mapped.runtimeId ?? mapped.exerciseIndex, mapped.setIndex)] = draft; return drafts; }, {});
}
function openActiveWorkoutExerciseEditor(mode = "add", exerciseIndex = null) { if (currentWorkout.mode !== "plan") return; const item = exerciseIndex === null ? null : normalizePlanExercises(currentWorkout.plannedExercises)[exerciseIndex]; activeWorkoutExerciseEdit = { mode, exerciseIndex, selectedExercise: mode === "replace" ? "" : item?.exercise || "", targetSets: item?.targetSets || 3, query: "" }; renderStructuredWorkout(); requestAnimationFrame(() => document.querySelector("#activeWorkoutExerciseSearch")?.focus()); }
function closeActiveWorkoutExerciseEditor() { activeWorkoutExerciseEdit = null; renderStructuredWorkout(); }
function saveActiveWorkoutExerciseEdit() {
  if (!activeWorkoutExerciseEdit || currentWorkout.mode !== "plan") return;
  const exercisesNow = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); const exercise = canonicalExerciseName(activeWorkoutExerciseEdit.selectedExercise, exercises); const targetSets = Number(document.querySelector("#activeWorkoutExerciseSets")?.value || activeWorkoutExerciseEdit.targetSets);
  if (!exercise || !Number.isInteger(targetSets) || targetSets < 1) return showToast("Choose an exercise and at least 1 working set.", "error");
  const duplicate = exercisesNow.some((item, index) => index !== activeWorkoutExerciseEdit.exerciseIndex && sameExercise(item.exercise, exercise));
  if (duplicate) return showToast(`${exercise} is already in today's workout.`, "error");
  if (activeWorkoutExerciseEdit.mode === "add") { exercisesNow.push({ exercise, targetSets, runtimeId: uid() }); activeWorkoutExerciseEdit = null; currentWorkout.plannedExercises = exercisesNow; return persistActiveWorkoutStructure(`${exercise} added to today's workout.`); }
  const index = activeWorkoutExerciseEdit.exerciseIndex; const old = exercisesNow[index]; if (!old) return closeActiveWorkoutExerciseEditor();
  const applyReplacement = () => { remapStructuredSlots(parts => parts.runtimeId === old.runtimeId ? null : parts); exercisesNow[index] = { exercise, targetSets, runtimeId: old.runtimeId }; currentWorkout.plannedExercises = exercisesNow; activeWorkoutExerciseEdit = null; closeConfirmation(); persistActiveWorkoutStructure(`${old.exercise} replaced with ${exercise} for today's workout.`); };
  const hasData = currentWorkout.sets.some(set => structuredSlotParts(set.slotId)?.exerciseIndex === index) || Object.keys(currentWorkout.drafts).some(slotId => structuredSlotParts(slotId)?.exerciseIndex === index);
  if (hasData) askConfirmation(`Replace ${old.exercise} with ${exercise}? Completed and draft sets for ${old.exercise} will be removed from today's workout.`, applyReplacement, "Replace"); else applyReplacement();
}
function addActiveWorkoutSet(exerciseIndex) { const items = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); if (!items[exerciseIndex]) return; items[exerciseIndex].targetSets++; currentWorkout.plannedExercises = items; persistActiveWorkoutStructure(`Set ${items[exerciseIndex].targetSets} added to ${items[exerciseIndex].exercise}.`); }
function removeActiveWorkoutSet(exerciseIndex, setIndex) {
  const items = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); const item = items[exerciseIndex]; if (!item) return; if (item.targetSets <= 1) return showToast("Keep at least 1 working set, or remove the exercise.", "error");
  const slotId = structuredSlotId(exerciseIndex, setIndex); const hasData = currentWorkout.sets.some(set => set.slotId === slotId) || !!currentWorkout.drafts[slotId];
  const remove = () => { remapStructuredSlots(parts => parts.runtimeId !== item.runtimeId ? parts : parts.setIndex === setIndex ? null : { runtimeId: item.runtimeId, setIndex: parts.setIndex > setIndex ? parts.setIndex - 1 : parts.setIndex }); items[exerciseIndex].targetSets--; currentWorkout.plannedExercises = items; closeConfirmation(); persistActiveWorkoutStructure(`Set removed from ${item.exercise}.`); };
  if (hasData) askConfirmation(`Remove Set ${setIndex + 1} from ${item.exercise}? Its completed or draft values will be removed from today's workout.`, remove, "Remove"); else remove();
}
function removeActiveWorkoutExercise(exerciseIndex) {
  const items = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); const item = items[exerciseIndex]; if (!item) return;
  const hasData = currentWorkout.sets.some(set => structuredSlotParts(set.slotId)?.exerciseIndex === exerciseIndex) || Object.keys(currentWorkout.drafts).some(slotId => structuredSlotParts(slotId)?.exerciseIndex === exerciseIndex);
  const remove = () => { remapStructuredSlots(parts => parts.runtimeId === item.runtimeId ? null : parts); items.splice(exerciseIndex, 1); currentWorkout.plannedExercises = items; closeConfirmation(); persistActiveWorkoutStructure(`${item.exercise} removed from today's workout.`); };
  if (hasData) askConfirmation(`Remove ${item.exercise} from today's workout? Completed and draft sets for this exercise will be removed from the current workout.`, remove, "Remove"); else remove();
}
function moveActiveWorkoutExercise(fromIndex, toIndex) { const items = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); if (fromIndex === toIndex || !items[fromIndex] || !items[toIndex]) return; const [moved] = items.splice(fromIndex, 1); items.splice(toIndex, 0, moved); currentWorkout.plannedExercises = items; persistActiveWorkoutStructure(`${moved.exercise} moved to exercise ${toIndex + 1}.`); }
function beginExerciseDrag(event) { const handle = event.target.closest("[data-drag-exercise]"); if (!handle || currentWorkout.mode !== "plan") return; const fromIndex = Number(handle.dataset.dragExercise); const pointerId = event.pointerId; const timer = setTimeout(() => { if (!exerciseDragState || exerciseDragState.pointerId !== pointerId) return; exerciseDragState.active = true; handle.setPointerCapture?.(pointerId); handle.closest(".structured-exercise")?.classList.add("dragging"); if (navigator.vibrate) navigator.vibrate(25); }, 350); exerciseDragState = { pointerId, fromIndex, toIndex: fromIndex, handle, timer, active: false }; }
function updateExerciseDrag(event) { if (!exerciseDragState || event.pointerId !== exerciseDragState.pointerId || !exerciseDragState.active) return; event.preventDefault(); const card = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-active-exercise-index]"); document.querySelectorAll(".structured-exercise.drag-over").forEach(item => item.classList.remove("drag-over")); if (card) { exerciseDragState.toIndex = Number(card.dataset.activeExerciseIndex); card.classList.add("drag-over"); } }
function endExerciseDrag(event) { if (!exerciseDragState || event.pointerId !== exerciseDragState.pointerId) return; clearTimeout(exerciseDragState.timer); const { active, fromIndex, toIndex, handle } = exerciseDragState; handle.closest(".structured-exercise")?.classList.remove("dragging"); document.querySelectorAll(".structured-exercise.drag-over").forEach(item => item.classList.remove("drag-over")); exerciseDragState = null; if (active && fromIndex !== toIndex) moveActiveWorkoutExercise(fromIndex, toIndex); }
function addExerciseDropSet(exerciseIndex) { const items = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); const item = items[exerciseIndex]; if (!item || item.dropSet) return; item.dropSet = normalizeDropSet({ stages: [{ id: uid() }] }); currentWorkout.plannedExercises = items; persistActiveWorkoutStructure(`Drop set added to ${item.exercise}.`); }
function updateDropStage(exerciseIndex, stageIndex, field, value) { const items = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); const stage = items[exerciseIndex]?.dropSet?.stages?.[stageIndex]; if (!stage || !["weight", "reps", "restSeconds"].includes(field)) return; stage[field] = value; stage.completed = false; currentWorkout.plannedExercises = items; save(KEYS.current, currentWorkout); const input = document.querySelector(`[data-drop-field="${field}"][data-exercise-index="${exerciseIndex}"][data-drop-stage="${stageIndex}"]`); input?.closest(".drop-stage")?.classList.remove("completed"); const button = input?.closest(".drop-stage")?.querySelector("[data-complete-drop-stage]"); if (button) { button.textContent = "Save drop"; button.classList.remove("btn-ghost"); button.classList.add("btn-primary"); } }
function completeDropStage(exerciseIndex, stageIndex) { const items = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); const item = items[exerciseIndex]; const stage = item?.dropSet?.stages?.[stageIndex]; if (!stage) return; const weight = Number(stage.weight); const reps = Number(stage.reps); const restSeconds = stage.restSeconds === "" ? null : Number(stage.restSeconds); if (!(weight > 0) || !Number.isInteger(reps) || reps <= 0 || (restSeconds !== null && (!Number.isInteger(restSeconds) || restSeconds < 0))) return showToast("Enter a valid drop weight, whole-number reps, and optional whole-number rest.", "error"); Object.assign(stage, { weight, reps, restSeconds, completed: true }); currentWorkout.plannedExercises = items; persistActiveWorkoutStructure(`${item.exercise} Drop ${stageIndex + 1} saved.`); }
function addDropStage(exerciseIndex) { const items = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); const dropSet = items[exerciseIndex]?.dropSet; if (!dropSet) return; dropSet.stages.push({ id: uid(), weight: "", reps: "", restSeconds: "", completed: false }); currentWorkout.plannedExercises = items; persistActiveWorkoutStructure(); }
function dropStageHasData(stage) { return !!stage?.completed || [stage?.weight, stage?.reps, stage?.restSeconds].some(value => value !== "" && value !== null && value !== undefined); }
function removeDropStage(exerciseIndex, stageIndex) { const items = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); const item = items[exerciseIndex]; const stages = item?.dropSet?.stages; const stage = stages?.[stageIndex]; if (!stage) return; if (stages.length <= 1) return showToast("A Drop Set block needs at least 1 drop. Remove the whole block instead.", "error"); const remove = () => { stages.splice(stageIndex, 1); currentWorkout.plannedExercises = items; closeConfirmation(); persistActiveWorkoutStructure(`Drop ${stageIndex + 1} removed.`); }; if (dropStageHasData(stage)) askConfirmation(`Remove Drop ${stageIndex + 1} from ${item.exercise}? Its values will be removed.`, remove, "Remove"); else remove(); }
function removeExerciseDropSet(exerciseIndex) { const items = ensureWorkoutExerciseIds(currentWorkout.plannedExercises); const item = items[exerciseIndex]; if (!item?.dropSet) return; const hasData = item.dropSet.stages.some(dropStageHasData); const remove = () => { delete item.dropSet; currentWorkout.plannedExercises = items; closeConfirmation(); persistActiveWorkoutStructure(`Drop set removed from ${item.exercise}.`); }; if (hasData) askConfirmation(`Remove the Drop Set from ${item.exercise}? All drop stages will be removed.`, remove, "Remove Drop Set"); else remove(); }
function dropStageSets(workout = currentWorkout) { return ensureWorkoutExerciseIds(workout.plannedExercises).flatMap(item => item.dropSet?.stages?.flatMap((stage, index) => stage.completed && Number(stage.weight) > 0 && Number(stage.reps) > 0 ? [{ id: stage.id, exercise: item.exercise, weight: Number(stage.weight), reps: Number(stage.reps), setType: "drop", dropPosition: index + 1, restSeconds: stage.restSeconds === "" || stage.restSeconds === null ? null : Number(stage.restSeconds) }] : []) || []); }
function renderDropSet(item, exerciseIndex) { if (!item.dropSet) return ""; return `<section class="drop-set-block"><div class="drop-set-head"><div><p class="eyebrow">🔥 DROP SET</p><small>Additional work · excluded from prescribed progress and PRs</small></div><button class="text-btn danger-action" data-remove-drop-set="${exerciseIndex}">Remove Drop Set</button></div>${item.dropSet.stages.map((stage, stageIndex) => `<div class="drop-stage${stage.completed ? " completed" : ""}"><div class="slot-heading"><strong>${stage.completed ? "✓" : "↓"} Drop ${stageIndex + 1}</strong><button class="icon-btn" data-remove-drop-stage="${stageIndex}" data-exercise-index="${exerciseIndex}" aria-label="Remove Drop ${stageIndex + 1}">×</button></div><div class="drop-inputs"><label>Weight (kg)<input type="number" inputmode="decimal" min="0" step="0.5" data-drop-field="weight" data-exercise-index="${exerciseIndex}" data-drop-stage="${stageIndex}" value="${stage.weight ?? ""}"></label><label>Reps<input type="number" inputmode="numeric" min="1" step="1" data-drop-field="reps" data-exercise-index="${exerciseIndex}" data-drop-stage="${stageIndex}" value="${stage.reps ?? ""}"></label><label>Rest (sec)<input type="number" inputmode="numeric" min="0" step="1" data-drop-field="restSeconds" data-exercise-index="${exerciseIndex}" data-drop-stage="${stageIndex}" value="${stage.restSeconds ?? ""}" placeholder="Optional"></label><button class="btn ${stage.completed ? "btn-ghost" : "btn-primary"}" data-complete-drop-stage="${stageIndex}" data-exercise-index="${exerciseIndex}">${stage.completed ? "Update drop" : "Save drop"}</button></div>${stageIndex < item.dropSet.stages.length - 1 ? `<div class="drop-reduce">↓ Reduce weight${stage.restSeconds !== "" && stage.restSeconds !== null ? ` · ${stage.restSeconds} sec rest` : ""}</div>` : ""}</div>`).join("")}<button class="btn btn-ghost add-drop-stage" data-add-drop-stage="${exerciseIndex}">+ Add drop</button></section>`; }
function renderActiveWorkoutExerciseEditor() {
  if (!activeWorkoutExerciseEdit) return "";
  const available = dedupeExerciseNames([...favourites, ...exercises, ...plans.flatMap(plan => normalizePlanExercises(plan.exercises).map(item => item.exercise))]); const query = activeWorkoutExerciseEdit.query || ""; const groups = groupedExerciseResults(available, query);
  const results = groups.length ? groups.map(group => `<section class="exercise-result-group"><h4>${escapeHTML(group.category.toUpperCase())}</h4>${group.exercises.map(name => `<button type="button" data-select-exercise="${encodeURIComponent(name)}" data-exercise-target="active-workout"><span>${escapeHTML(name)}</span><small>${escapeHTML(exerciseCategory(name))}</small></button>`).join("")}</section>`).join("") : `<p class="exercise-no-results">No exercises match “${escapeHTML(query)}”.</p>`;
  return `<article class="panel active-workout-editor"><div class="panel-head"><div><p class="eyebrow">${activeWorkoutExerciseEdit.mode === "replace" ? "REPLACE EXERCISE" : "ADD EXERCISE"}</p><h3>${activeWorkoutExerciseEdit.selectedExercise ? escapeHTML(activeWorkoutExerciseEdit.selectedExercise) : "Choose an exercise"}</h3></div><button class="icon-btn" data-close-active-exercise aria-label="Close">×</button></div><label>Search exercises<input id="activeWorkoutExerciseSearch" type="search" value="${escapeHTML(query)}" placeholder="Search exercises or categories…"></label><div class="exercise-results active-workout-results">${results}</div><label>Working sets<input id="activeWorkoutExerciseSets" type="number" min="1" step="1" value="${activeWorkoutExerciseEdit.targetSets}"></label><button class="btn btn-primary" data-save-active-exercise>${activeWorkoutExerciseEdit.mode === "replace" ? "Replace exercise" : "Add to workout"}</button></article>`;
}
function renderStructuredWorkout() {
  const container = document.querySelector("#structuredWorkout");
  const planExercises = ensureWorkoutExerciseIds(currentWorkout.plannedExercises);
  const total = planExercises.reduce((sum, item) => sum + item.targetSets, 0);
  const completed = planExercises.reduce((sum, item, exerciseIndex) => sum + Array.from({ length: item.targetSets }, (_, setIndex) => currentWorkout.sets.some(set => set.slotId === structuredSlotId(exerciseIndex, setIndex))).filter(Boolean).length, 0);
  const percent = total ? Math.round(completed / total * 100) : 0;
  container.innerHTML = `<div class="structured-progress panel"><div><p class="eyebrow">${escapeHTML(currentWorkout.planName || "PLAN WORKOUT")}</p><h2>${completed} / ${total} sets completed</h2><small>${planExercises.length} exercise${planExercises.length === 1 ? "" : "s"} in today's workout</small></div><strong>${percent}%</strong><div class="structured-progress-track"><span style="width:${percent}%"></span></div></div><button class="btn btn-primary active-workout-add-exercise" data-add-active-exercise>+ Add exercise</button>${renderActiveWorkoutExerciseEditor()}${planExercises.map((item, exerciseIndex) => {
    const previousPerformance = previousExercisePerformance(item.exercise); const previousSets = previousPerformance.sets;
    const historicalBest = historicalExerciseBest(item.exercise);
    const slots = Array.from({ length: item.targetSets }, (_, setIndex) => {
      const slotId = structuredSlotId(exerciseIndex, setIndex);
      const set = currentWorkout.sets.find(entry => entry.slotId === slotId);
      const draft = currentWorkout.drafts[slotId] || {};
      const previousSet = previousSets[setIndex];
      const feedback = set ? structuredSetFeedback(set, setIndex, previousSets, historicalBest) : [];
      return `<div class="structured-set-slot${set ? " completed" : ""}"><div class="slot-heading"><strong>${set ? "✓" : "○"} Set ${setIndex + 1}</strong><div>${previousSet ? `<small class="previous-slot-label">Previous: ${previousSet.weight} kg × ${previousSet.reps}</small>` : ""}<button class="icon-btn remove-structured-slot" data-remove-active-set="${setIndex}" data-exercise-index="${exerciseIndex}" aria-label="Remove set ${setIndex + 1}">×</button></div></div><div class="today-label">Today’s set</div><div class="slot-inputs"><label>Weight<input inputmode="decimal" type="number" min="0" step="0.5" data-slot-weight="${slotId}" value="${set?.weight ?? draft.weight ?? ""}" placeholder="${previousSet?.weight ?? "kg"}"></label><label>Reps<input inputmode="numeric" type="number" min="1" step="1" data-slot-reps="${slotId}" value="${set?.reps ?? draft.reps ?? ""}" placeholder="${previousSet?.reps ?? "reps"}"></label><button class="btn ${set ? "btn-ghost" : "btn-primary"}" data-complete-slot="${slotId}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}">${set ? "Update set" : "Complete set"}</button>${set ? `<button class="icon-btn" data-delete-set="${set.id}" aria-label="Clear set ${setIndex + 1}">×</button>` : previousSet ? `<button class="btn use-previous-btn" data-use-previous="${slotId}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}">Use previous</button>` : ""}</div>${feedback.length ? `<div class="slot-feedback">${feedback.map(message => `<span>${escapeHTML(message)}</span>`).join("")}</div>` : ""}</div>`;
    }).join("");
    const exerciseCompleted = Array.from({ length: item.targetSets }, (_, setIndex) => currentWorkout.sets.some(set => set.slotId === structuredSlotId(exerciseIndex, setIndex))).filter(Boolean).length;
    const previous = previousSets.length ? `<details class="previous-performance"><summary>Previous workout: ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(previousPerformance.workout.finishedAt))}</summary><p>${previousSets.slice(0, 4).map(set => `${set.weight} kg × ${set.reps}`).join(" · ")}</p></details>` : "";
    const currentExerciseSets = currentWorkout.sets.filter(set => sameExercise(set.exercise, item.exercise)); const improvedVolume = exerciseCompleted === item.targetSets && previousSets.length && volumeOf(currentExerciseSets) > volumeOf(previousSets);
    return `<article class="structured-exercise panel${exerciseCompleted === item.targetSets ? " exercise-complete" : ""}" data-active-exercise-index="${exerciseIndex}" data-runtime-id="${item.runtimeId}"><header><div class="structured-title"><button class="drag-handle" data-drag-exercise="${exerciseIndex}" aria-label="Hold and drag ${escapeHTML(item.exercise)} to reorder">☰</button><div><p class="eyebrow">EXERCISE ${exerciseIndex + 1}</p><h3>${exerciseCompleted === item.targetSets ? "✓ " : ""}${escapeHTML(item.exercise)}</h3></div></div><div class="structured-exercise-actions"><strong>${exerciseCompleted} / ${item.targetSets} working sets</strong><details><summary aria-label="Actions for ${escapeHTML(item.exercise)}">⋮</summary><div><button data-move-active-exercise="up" data-exercise-index="${exerciseIndex}"${exerciseIndex === 0 ? " disabled" : ""}>Move up</button><button data-move-active-exercise="down" data-exercise-index="${exerciseIndex}"${exerciseIndex === planExercises.length - 1 ? " disabled" : ""}>Move down</button><button data-add-active-set="${exerciseIndex}">Add set</button>${item.dropSet ? "" : `<button data-add-drop-set="${exerciseIndex}">Add drop set</button>`}<button data-replace-active-exercise="${exerciseIndex}">Replace exercise</button><button data-open-guide="${encodeURIComponent(item.exercise)}">View form guide</button><button class="danger-action" data-remove-active-exercise="${exerciseIndex}">Remove exercise</button></div></details></div></header>${exerciseCompleted === item.targetSets ? `<p class="exercise-success">✓ ${escapeHTML(item.exercise)} complete${improvedVolume ? " · More total work than your previous session." : ""}</p>` : ""}${previous}${slots}${renderDropSet(item, exerciseIndex)}</article>`;
  }).join("")}`;
}
function completeStructuredSet(slotId, exerciseIndex, setIndex) {
  if (!requireAuthenticatedUser() || currentWorkout.mode !== "plan") return;
  const item = normalizePlanExercises(currentWorkout.plannedExercises)[exerciseIndex];
  if (!item || setIndex >= item.targetSets) return;
  const weight = Number(document.querySelector(`[data-slot-weight="${slotId}"]`)?.value);
  const reps = Number(document.querySelector(`[data-slot-reps="${slotId}"]`)?.value);
  if (!weight || weight <= 0 || !Number.isInteger(reps) || reps <= 0) return showToast("Enter a valid weight and whole-number reps.", "error");
  const existing = currentWorkout.sets.find(set => set.slotId === slotId); const wasExerciseComplete = Array.from({ length: item.targetSets }, (_, index) => currentWorkout.sets.some(set => set.slotId === structuredSlotId(exerciseIndex, index))).every(Boolean);
  if (existing) Object.assign(existing, { exercise: item.exercise, weight, reps });
  else currentWorkout.sets.push({ id: uid(), slotId, exercise: item.exercise, weight, reps, createdAt: new Date().toISOString() });
  delete currentWorkout.drafts[slotId];
  save(KEYS.current, currentWorkout); renderWorkout(); renderDashboard();
  const previousSets = previousExercisePerformance(item.exercise).sets;
  const feedback = structuredSetFeedback({ weight, reps }, setIndex, previousSets, historicalExerciseBest(item.exercise));
  const isExerciseComplete = Array.from({ length: item.targetSets }, (_, index) => currentWorkout.sets.some(set => set.slotId === structuredSlotId(exerciseIndex, index))).every(Boolean);
  showToast(!wasExerciseComplete && isExerciseComplete ? `${exerciseCategory(item.exercise)} work complete.` : `Set ${setIndex + 1} ${existing ? "updated" : "complete"} ✓ · ${feedback[0]}`);
}
function openFormGuide(exercise) { const guideSelect = document.querySelector("#guideExercise"); guideOpenedFromWorkout = currentWorkout.mode === "plan" && document.querySelector("#workoutView").classList.contains("active"); renderExerciseSelectors(); const match = [...guideSelect.options].find(option => sameExercise(option.value, exercise)); if (match) guideSelect.value = match.value; showView("guide"); renderGuide(); document.querySelector("#backToWorkout").classList.toggle("hidden", !guideOpenedFromWorkout); if (!getFormGuide(exercise)) showToast("Detailed form guide coming soon."); }
function backToWorkout() { if (!guideOpenedFromWorkout) return; guideOpenedFromWorkout = false; document.querySelector("#backToWorkout").classList.add("hidden"); renderWorkout(); showView("workout"); }
function saveStructuredDraft(slotId, field, value) { if (currentWorkout.mode !== "plan") return; currentWorkout.drafts[slotId] ??= {}; currentWorkout.drafts[slotId][field] = value; if (!currentWorkout.drafts[slotId].weight && !currentWorkout.drafts[slotId].reps) delete currentWorkout.drafts[slotId]; save(KEYS.current, currentWorkout); }
function usePreviousSet(slotId, exerciseIndex, setIndex) { if (!requireAuthenticatedUser() || currentWorkout.mode !== "plan") return; const item = normalizePlanExercises(currentWorkout.plannedExercises)[exerciseIndex]; const previous = item ? previousExercisePerformance(item.exercise).sets[setIndex] : null; if (!previous) return; currentWorkout.drafts[slotId] = { weight: String(previous.weight), reps: String(previous.reps) }; save(KEYS.current, currentWorkout); const weightInput = document.querySelector(`[data-slot-weight="${slotId}"]`); const repsInput = document.querySelector(`[data-slot-reps="${slotId}"]`); if (weightInput) weightInput.value = previous.weight; if (repsInput) repsInput.value = previous.reps; showToast("Previous values filled. Complete the set when ready."); }

function clearFoodInputs() { document.querySelector("#foodName").value = ""; document.querySelector("#foodProtein").value = ""; document.querySelector("#foodCalories").value = ""; document.querySelector("#foodQuantity").value = "1"; }
async function addFood() {
  if (!requireAuthenticatedUser()) return;
  const name = document.querySelector("#foodName").value.trim();
  const protein = Number(document.querySelector("#foodProtein").value);
  const calories = Number(document.querySelector("#foodCalories").value || 0);
  const quantity = Number(document.querySelector("#foodQuantity").value);
  if (!name || protein <= 0 || calories < 0 || quantity <= 0) return showToast("Enter a meal name, protein, and valid optional calories.", "error");
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) return showToast(userError?.message || "Your session expired. Sign in again before adding food.", "error");
  const before = nutritionTotals().protein; const target = activeProteinTarget();
  const { error } = await supabaseClient.from("nutrition_logs").insert({ user_id: user.id, food_name: name, protein, calories: calories || null, quantity });
  if (error) return showToast(`Food was not saved: ${error.message}`, "error");
  clearFoodInputs();
  const refreshed = await loadSupabaseNutrition({ quiet: true });
  const after = nutritionTotals().protein; const crossed = target === null ? "Protein target is still loading." : before < target && after >= target ? "Daily protein target achieved 🎯" : before < target * .75 && after >= target * .75 ? `Strong day — only ${Math.max(0, Math.round(target - after))} g remaining.` : before < target * .5 && after >= target * .5 ? "Halfway there 💪" : `Great addition — you're now at ${Math.round(after)} / ${target} g.`; showToast(refreshed ? `+${formatNumber(protein * quantity)} g protein · ${crossed}` : "Meal saved, but nutrition data could not be refreshed.", refreshed ? "success" : "error");
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
function renderNutrition() { const dailyFoods = todayFoods(); const totals = nutritionTotals(dailyFoods); const target = activeProteinTarget(); const targetLoading = target === null; const percent = targetLoading ? 0 : Math.min(totals.protein / target * 100, 100); const remaining = targetLoading ? null : Math.max(0, target - totals.protein); const feedback = targetLoading ? "Loading protein target…" : nutritionFeedback(totals.protein, target); const proteinRing = document.querySelector("#proteinRing"); const proteinRingTarget = document.querySelector("#proteinTargetLabel") || proteinRing.querySelector("span"); document.querySelector("#proteinTotal").textContent = `${formatNumber(totals.protein)}g`; proteinRingTarget.textContent = targetLoading ? "of —" : `of ${target}g`; proteinRing.style.setProperty("--protein", `${percent * 3.6}deg`); document.querySelector("#proteinMessage").textContent = feedback; document.querySelector("#nutritionStatus").textContent = feedback; document.querySelector("#nutritionProteinCurrent").textContent = formatNumber(totals.protein); document.querySelector("#nutritionProteinTarget").textContent = targetLoading ? "—" : target; document.querySelector("#nutritionRemaining").textContent = targetLoading ? "Loading target…" : totals.protein >= target ? "Target reached" : `${formatNumber(remaining)} g remaining`; document.querySelector("#nutritionProgressBar").style.width = `${percent}%`; document.querySelector("#nutritionCalories").textContent = `${formatNumber(totals.calories)} kcal`; document.querySelector("#foodCount").textContent = `${dailyFoods.length} item${dailyFoods.length === 1 ? "" : "s"}`; const list = document.querySelector("#foodList"); list.classList.toggle("empty-state", !dailyFoods.length); list.innerHTML = dailyFoods.length ? dailyFoods.map(food => `<div class="food-row"><div><strong>${escapeHTML(food.name)}</strong><small>${formatNumber(food.protein * food.quantity)} g protein${food.calories ? ` • ${formatNumber(food.calories * food.quantity)} kcal` : ""}</small><small>${new Date(food.loggedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></div><div><strong>${food.quantity}</strong><small>quantity</small></div><div><strong>${formatNumber(food.protein * food.quantity)}g</strong><small>protein</small></div><button class="icon-btn" data-delete-food="${food.id}" aria-label="Delete food">×</button></div>`).join("") : "No foods logged today."; const historyFoods = foods.filter(food => localDateKey(food.loggedAt) !== localDateKey()); const grouped = historyFoods.reduce((days, food) => { const key = localDateKey(food.loggedAt); (days[key] ??= []).push(food); return days; }, {}); const history = document.querySelector("#nutritionHistory"); const entries = Object.entries(grouped); history.classList.toggle("empty-state", !entries.length); history.innerHTML = entries.length ? entries.map(([day, items]) => `<div class="nutrition-history-day"><strong>${new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</strong><span>${formatNumber(nutritionTotals(items).protein)} g protein · ${items.length} meal${items.length === 1 ? "" : "s"}</span></div>`).join("") : "Recent meals will appear here."; }

function planExerciseRows(planId, planExercises) { return normalizePlanExercises(planExercises).map((item, position) => ({ workout_plan_id: planId, exercise: item.exercise, target_sets: item.targetSets, position })); }

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
  showToast(refreshed ? `Your ${name} is ready 💪` : "Plan created, but plans could not be refreshed.", refreshed ? "success" : "error");
}

async function updateSupabasePlan(plan, name, planExercises) {
  const { error: nameError } = await supabaseClient.from("workout_plans").update({ name, updated_at: new Date().toISOString() }).eq("id", plan.id);
  if (nameError) return showToast(`Plan was not updated: ${nameError.message}`, "error");
  const { error: deleteError } = await supabaseClient.from("workout_plan_exercises").delete().eq("workout_plan_id", plan.id);
  if (deleteError) {
    await supabaseClient.from("workout_plans").update({ name: plan.name, ...(plan.updatedAt ? { updated_at: plan.updatedAt } : {}) }).eq("id", plan.id);
    return showToast(`Existing plan exercises could not be replaced: ${deleteError.message}`, "error");
  }
  const { error: insertError } = await supabaseClient.from("workout_plan_exercises").insert(planExerciseRows(plan.id, planExercises));
  if (insertError) {
    const rollbackResults = await Promise.all([
      supabaseClient.from("workout_plans").update({ name: plan.name, ...(plan.updatedAt ? { updated_at: plan.updatedAt } : {}) }).eq("id", plan.id),
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
  if (!requireAuthenticatedUser() || planSaveInFlight) return;
  planSaveInFlight = true; document.querySelector("#savePlan").disabled = true;
  try {
  const name = document.querySelector("#planName").value.trim();
  const planExercises = collectDraftPlanExercises();
  if (planExercises === null) return;
  if (!name || !planExercises.length) return showToast("Add a plan name and at least one exercise.", "error");
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) return showToast(userError?.message || "Your session expired. Sign in again before saving a plan.", "error");
  const existingPlan = editingPlanId ? plans.find(item => item.id === editingPlanId) : null;
  if (!existingPlan) await loadSupabasePlans({ quiet: true });
  const duplicate = !existingPlan ? plans.find(item => normalizePlanName(item.name) === normalizePlanName(name)) : null;
  if (duplicate) return openDuplicatePlanModal({ user, name, planExercises, duplicate });
  return await (existingPlan ? updateSupabasePlan(existingPlan, name, planExercises) : createSupabasePlan(user, name, planExercises));
  } finally { planSaveInFlight = false; document.querySelector("#savePlan").disabled = false; }
}
function normalizePlanName(value) { return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase(); }
function openDuplicatePlanModal(context) { pendingDuplicatePlan = context; document.querySelector("#duplicatePlanMessage").textContent = `A plan named ${context.duplicate.name} already exists.`; const modal = document.querySelector("#duplicatePlanModal"); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); document.querySelector("#duplicateCancel").focus(); }
function closeDuplicatePlanModal() { pendingDuplicatePlan = null; const modal = document.querySelector("#duplicatePlanModal"); modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); }
async function resolveDuplicatePlan(action) { const context = pendingDuplicatePlan; if (!context || planSaveInFlight) return; closeDuplicatePlanModal(); if (action === "cancel") return document.querySelector("#planName").focus(); planSaveInFlight = true; document.querySelector("#savePlan").disabled = true; try { if (action === "create") return await createSupabasePlan(context.user, context.name, context.planExercises); if (action === "update") return await updateSupabasePlan(context.duplicate, context.name, context.planExercises); } finally { planSaveInFlight = false; document.querySelector("#savePlan").disabled = false; } }
function collectDraftPlanExercises() {
  const rows = [...document.querySelectorAll("#planExerciseRows .plan-exercise-row")];
  const availableNames = dedupeExerciseNames([...exercises, ...favourites, ...plans.flatMap(plan => normalizePlanExercises(plan.exercises).map(item => item.exercise))]);
  const result = rows.map((row, index) => ({ exercise: canonicalExerciseName(row.querySelector("[data-plan-exercise-name]").value, availableNames), targetSets: Number(row.querySelector("[data-plan-target-sets]").value), index }));
  const invalid = result.find(item => !item.exercise || !Number.isInteger(item.targetSets) || item.targetSets < 1);
  if (invalid) { showToast("Every plan exercise needs a name and at least 1 whole-number set.", "error"); return null; }
  if (new Set(result.map(item => exerciseKey(item.exercise))).size !== result.length) { showToast("Each exercise can appear only once in a plan.", "error"); return null; }
  draftPlanExercises = result.map(({ exercise, targetSets }) => ({ exercise, targetSets }));
  return draftPlanExercises;
}
function renderPlanExerciseRows() {
  const list = document.querySelector("#planExerciseRows");
  list.classList.toggle("empty-state", !draftPlanExercises.length);
  list.innerHTML = draftPlanExercises.length ? draftPlanExercises.map((item, index) => `<div class="plan-exercise-row"><span class="set-number">${index + 1}</span><label>Exercise<input data-plan-exercise-name="${index}" value="${escapeHTML(item.exercise)}"></label><label>Sets<input data-plan-target-sets="${index}" type="number" min="1" step="1" inputmode="numeric" value="${item.targetSets}"></label><button class="icon-btn" data-remove-plan-exercise="${index}" aria-label="Remove ${escapeHTML(item.exercise)}">×</button></div>`).join("") : "Add exercises to build this workout.";
}
function addPlanExercise() {
  if (!requireAuthenticatedUser()) return;
  if (collectDraftPlanExercises() === null) return;
  const availableNames = dedupeExerciseNames([...exercises, ...favourites, ...plans.flatMap(plan => normalizePlanExercises(plan.exercises).map(item => item.exercise)), ...draftPlanExercises.map(item => item.exercise)]);
  const exercise = canonicalExerciseName(document.querySelector("#planExerciseName").value, availableNames);
  const targetSets = Number(document.querySelector("#planExerciseSets").value);
  if (!exercise || !Number.isInteger(targetSets) || targetSets < 1) return showToast("Choose an exercise and enter at least 1 whole-number set.", "error");
  if (draftPlanExercises.some(item => sameExercise(item.exercise, exercise))) return showToast(`${exercise} is already in this plan.`, "error");
  draftPlanExercises.push({ exercise, targetSets });
  document.querySelector("#planExerciseName").value = ""; document.querySelector("#planExerciseSets").value = "3";
  document.querySelector("#planExerciseResults").classList.add("hidden"); renderPlanExerciseRows(); document.querySelector("#planExerciseName").focus();
}
function removePlanExercise(index) { if (collectDraftPlanExercises() === null) return; draftPlanExercises.splice(index, 1); renderPlanExerciseRows(); }
function editPlan(id) { const plan = plans.find(item => item.id === id); if (!plan) return; editingPlanId = id; draftPlanExercises = normalizePlanExercises(plan.exercises); document.querySelector("#planName").value = plan.name; renderPlanExerciseRows(); document.querySelector("#planFormTitle").textContent = "Edit plan"; document.querySelector("#savePlan").textContent = "Update plan"; document.querySelector("#cancelPlanEdit").classList.remove("hidden"); }
function cancelPlanEdit() { editingPlanId = null; draftPlanExercises = []; document.querySelector("#planName").value = ""; document.querySelector("#planExerciseName").value = ""; document.querySelector("#planExerciseSets").value = "3"; renderPlanExerciseRows(); document.querySelector("#planFormTitle").textContent = "Create a plan"; document.querySelector("#savePlan").textContent = "Save plan"; document.querySelector("#cancelPlanEdit").classList.add("hidden"); }
function planTimestampInfo(plan) { const created = plan.createdAt ? new Date(plan.createdAt) : new Date(NaN); const updated = plan.updatedAt ? new Date(plan.updatedAt) : new Date(NaN); const hasCreated = Number.isFinite(created.getTime()); const hasUpdated = Number.isFinite(updated.getTime()); if (!hasCreated && !hasUpdated) return null; const edited = hasUpdated && (!hasCreated || updated.getTime() - created.getTime() >= 5000); const date = edited ? updated : created; return { label: edited ? "Updated" : "Created", date, time: date.getTime() }; }
function formatPlanTimestamp(plan) { const info = planTimestampInfo(plan); if (!info) return ""; const formatted = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(info.date); return `${info.label}: ${formatted.replace(/, (?=\d{1,2}:)/, " • ")}`; }
function renderPlans() { const list = document.querySelector("#plansList"); const displayPlans = [...plans].sort((left, right) => (planTimestampInfo(right)?.time || 0) - (planTimestampInfo(left)?.time || 0)); list.classList.toggle("empty-state", !plans.length); list.innerHTML = plans.length ? displayPlans.map(plan => { const planExercises = normalizePlanExercises(plan.exercises); const timestamp = formatPlanTimestamp(plan); return `<article class="plan-card"><h3>${escapeHTML(plan.name)}</h3>${timestamp ? `<p class="plan-timestamp">${escapeHTML(timestamp)}</p>` : ""}<p class="plan-summary"><strong>${planExercises.length}</strong> Exercise${planExercises.length === 1 ? "" : "s"} <span>•</span> <strong>${planExercises.reduce((sum, item) => sum + item.targetSets, 0)}</strong> Sets</p><ul>${planExercises.map(item => `<li><span>${escapeHTML(item.exercise)}</span><strong>${item.targetSets} set${item.targetSets === 1 ? "" : "s"}</strong></li>`).join("")}</ul><div class="plan-card-actions"><button class="btn btn-primary" data-start-plan="${plan.id}">Start plan</button><button class="btn btn-ghost" data-edit-plan="${plan.id}">Edit</button><button class="icon-btn" data-delete-plan="${plan.id}" aria-label="Delete plan">×</button></div></article>`; }).join("") : "No plans saved yet."; }

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
  const isFavourite = favourites.some(item => sameExercise(item, exercise));
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) return showToast(userError?.message || "Your session expired. Sign in again before updating favourites.", "error");
  const query = isFavourite
    ? supabaseClient.from("favourite_exercises").delete().ilike("exercise", exercise)
    : supabaseClient.from("favourite_exercises").insert({ user_id: user.id, exercise: canonicalExerciseName(exercise, exercises) });
  const { error } = await query;
  if (error) return showToast(`Favourite was not updated: ${error.message}`, "error");
  const refreshed = await loadSupabaseFavourites({ quiet: true });
  showToast(refreshed ? (isFavourite ? "Removed from favourites" : "Added to favourites") : "Favourite changed, but favourites could not be refreshed.", refreshed ? "success" : "error");
}
function renderFavourites() { const selected = document.querySelector("#exerciseSelect").value; renderExerciseSelectors(); const activeExercise = document.querySelector("#exerciseSelect").value || selected; const active = favourites.some(item => sameExercise(item, activeExercise)); document.querySelector("#toggleFavourite").classList.toggle("active", active); document.querySelector("#toggleFavourite").textContent = active ? "★" : "☆"; document.querySelector("#favouriteChips").innerHTML = dedupeExerciseNames(favourites).map(item => `<button class="chip" data-favourite="${escapeHTML(item)}">★ ${escapeHTML(item)}</button>`).join(""); }

function renderAnalytics() { const allSets = workoutHistory.flatMap(workout => workout.sets); document.querySelector("#analyticsWorkouts").textContent = workoutHistory.length; document.querySelector("#analyticsSets").textContent = allSets.length; document.querySelector("#analyticsVolume").textContent = `${formatNumber(workoutHistory.reduce((sum, workout) => sum + workoutVolume(workout), 0))} kg`; const best = Math.max(0, ...allSets.filter(set => set.setType !== "drop").map(set => epley(set.weight, set.reps))); document.querySelector("#analytics1rm").textContent = best ? `${formatNumber(best)} kg` : "—"; const recent = workoutHistory.slice(0, 7).reverse(); const chart = document.querySelector("#volumeChart"); chart.classList.toggle("empty-state", !recent.length); const max = Math.max(1, ...recent.map(workoutVolume)); chart.innerHTML = recent.length ? recent.map(item => `<div class="bar-wrap" title="${formatNumber(workoutVolume(item))} kg"><span class="bar" style="height:${Math.max(3, workoutVolume(item) / max * 90)}%"></span><small>${new Date(item.finishedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</small></div>`).join("") : "Finish a workout to see your volume trend."; const grouped = {}; allSets.forEach(set => { const exercise = canonicalExerciseName(set.exercise, Object.keys(grouped)); grouped[exercise] ??= { sets: 0, volume: 0, best: 0 }; grouped[exercise].sets++; grouped[exercise].volume += set.weight * set.reps; if (set.setType !== "drop") grouped[exercise].best = Math.max(grouped[exercise].best, epley(set.weight, set.reps)); }); const stats = document.querySelector("#exerciseStats"); const entries = Object.entries(grouped).sort((a, b) => b[1].volume - a[1].volume); stats.classList.toggle("empty-state", !entries.length); stats.innerHTML = entries.length ? entries.map(([name, data]) => `<div class="stat-row"><div><strong>${escapeHTML(name)}</strong><small>${data.sets} sets</small></div><div><strong>${formatNumber(data.volume)} kg</strong><small>volume</small></div><div><strong>${data.best ? `${formatNumber(data.best)} kg` : "—"}</strong><small>best 1RM</small></div></div>`).join("") : "Exercise insights will appear here."; }
function renderGuide() { const exercise = document.querySelector("#guideExercise").value; const available = getFormGuide(exercise); const guide = available || defaultGuide; document.querySelector("#guideName").textContent = exercise || "Exercise"; document.querySelector("#guideMuscles").textContent = guide.muscles; document.querySelector("#guideSecondary").textContent = guide.secondary; document.querySelector("#guideEquipment").textContent = guide.equipment; document.querySelector("#guideDifficulty").textContent = guide.difficulty; document.querySelector("#guideComingSoon").classList.toggle("hidden", !!available); document.querySelector(".guide-grid").classList.toggle("hidden", !available); [["setupCues", guide.setup], ["executionCues", guide.execution], ["breathingCues", guide.breathing], ["mistakeCues", guide.mistakes], ["safetyCues", guide.safety]].forEach(([id, cues]) => { document.querySelector(`#${id}`).innerHTML = cues.map(item => `<li>${escapeHTML(item)}</li>`).join(""); }); }

document.addEventListener("click", event => { const button = event.target.closest("button"); if (!button) return; if (button.closest("#appShell") && !requireAuthenticatedUser()) return; if (button.hasAttribute("data-skip-warmup")) skipWarmup(); if (button.hasAttribute("data-add-active-exercise")) openActiveWorkoutExerciseEditor("add"); if (button.hasAttribute("data-close-active-exercise")) closeActiveWorkoutExerciseEditor(); if (button.hasAttribute("data-save-active-exercise")) saveActiveWorkoutExerciseEdit(); if (button.dataset.moveActiveExercise) { const index = Number(button.dataset.exerciseIndex); moveActiveWorkoutExercise(index, index + (button.dataset.moveActiveExercise === "up" ? -1 : 1)); } if (button.dataset.addActiveSet !== undefined) addActiveWorkoutSet(Number(button.dataset.addActiveSet)); if (button.dataset.addDropSet !== undefined) addExerciseDropSet(Number(button.dataset.addDropSet)); if (button.dataset.addDropStage !== undefined) addDropStage(Number(button.dataset.addDropStage)); if (button.dataset.completeDropStage !== undefined) completeDropStage(Number(button.dataset.exerciseIndex), Number(button.dataset.completeDropStage)); if (button.dataset.removeDropStage !== undefined) removeDropStage(Number(button.dataset.exerciseIndex), Number(button.dataset.removeDropStage)); if (button.dataset.removeDropSet !== undefined) removeExerciseDropSet(Number(button.dataset.removeDropSet)); if (button.dataset.removeActiveSet !== undefined) removeActiveWorkoutSet(Number(button.dataset.exerciseIndex), Number(button.dataset.removeActiveSet)); if (button.dataset.replaceActiveExercise !== undefined) openActiveWorkoutExerciseEditor("replace", Number(button.dataset.replaceActiveExercise)); if (button.dataset.removeActiveExercise !== undefined) removeActiveWorkoutExercise(Number(button.dataset.removeActiveExercise)); if (button.dataset.selectExercise) selectExerciseFromBrowser(decodeURIComponent(button.dataset.selectExercise), button.dataset.exerciseTarget); if (button.dataset.view) showView(button.dataset.view); if (button.dataset.go) showView(button.dataset.go); if (button.dataset.openGuide) openFormGuide(decodeURIComponent(button.dataset.openGuide)); if (button.dataset.editSet) editSet(button.dataset.editSet); if (button.dataset.deleteSet) deleteSet(button.dataset.deleteSet); if (button.dataset.completeSlot) completeStructuredSet(button.dataset.completeSlot, Number(button.dataset.exerciseIndex), Number(button.dataset.setIndex)); if (button.dataset.usePrevious) usePreviousSet(button.dataset.usePrevious, Number(button.dataset.exerciseIndex), Number(button.dataset.setIndex)); if (button.dataset.removePlanExercise) removePlanExercise(Number(button.dataset.removePlanExercise)); if (button.dataset.deleteFood) deleteFood(button.dataset.deleteFood); if (button.dataset.startPlan) startWorkout(plans.find(plan => plan.id === button.dataset.startPlan)); if (button.dataset.editPlan) editPlan(button.dataset.editPlan); if (button.dataset.deletePlan) requestPlanDeletion(button.dataset.deletePlan); if (button.dataset.deleteWorkout) requestWorkoutDeletion(button.dataset.deleteWorkout); if (button.dataset.favourite) { document.querySelector("#exerciseSelect").value = button.dataset.favourite; document.querySelector("#exercisePickerValue").textContent = button.dataset.favourite; renderFavourites(); } });
document.addEventListener("input", event => { if (!isAuthenticated()) return; if (event.target.dataset.dropField) updateDropStage(Number(event.target.dataset.exerciseIndex), Number(event.target.dataset.dropStage), event.target.dataset.dropField, event.target.value); if (event.target.id === "activeWorkoutExerciseSearch" && activeWorkoutExerciseEdit) { activeWorkoutExerciseEdit.query = event.target.value; const available = dedupeExerciseNames([...favourites, ...exercises, ...plans.flatMap(plan => normalizePlanExercises(plan.exercises).map(item => item.exercise))]); renderExerciseBrowser(document.querySelector(".active-workout-results"), available, event.target.value, "active-workout"); } if (event.target.id === "activeWorkoutExerciseSets" && activeWorkoutExerciseEdit) activeWorkoutExerciseEdit.targetSets = event.target.value; if (event.target.matches("[data-slot-weight]")) saveStructuredDraft(event.target.dataset.slotWeight, "weight", event.target.value); if (event.target.matches("[data-slot-reps]")) saveStructuredDraft(event.target.dataset.slotReps, "reps", event.target.value); });
document.querySelector("#aiCoachForm").addEventListener("submit", event => { event.preventDefault(); submitAiCoachQuestion(); });
document.querySelector("#clearAiCoach").addEventListener("click", clearAiCoachConversation);
document.querySelector("#aiCoachPrompts").addEventListener("click", event => { const prompt = event.target.closest("[data-ai-prompt]")?.dataset.aiPrompt; if (prompt) submitAiCoachQuestion(prompt); });
document.querySelector("#aiCoachInput").addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitAiCoachQuestion(); } });
document.addEventListener("pointerdown", beginExerciseDrag);
document.addEventListener("pointermove", updateExerciseDrag, { passive: false });
document.addEventListener("pointerup", endExerciseDrag);
document.addEventListener("pointercancel", endExerciseDrag);
document.querySelector("#mobileMenu").addEventListener("click", () => { if (requireAuthenticatedUser()) document.querySelector(".sidebar").classList.toggle("open"); });
document.querySelector("#dashboardStart").addEventListener("click", () => startWorkout()); document.querySelector("#addSet").addEventListener("click", addSet); document.querySelector("#finishWorkout").addEventListener("click", finishWorkout); document.querySelector("#toggleFavourite").addEventListener("click", toggleFavourite); document.querySelector("#exerciseSelect").addEventListener("change", () => { if (requireAuthenticatedUser()) renderFavourites(); }); document.querySelector("#addFood").addEventListener("click", addFood); document.querySelector("#addPlanExercise").addEventListener("click", addPlanExercise); document.querySelector("#savePlan").addEventListener("click", savePlan); document.querySelector("#cancelPlanEdit").addEventListener("click", () => { if (requireAuthenticatedUser()) cancelPlanEdit(); }); document.querySelector("#guideExercise").addEventListener("change", () => { if (requireAuthenticatedUser()) renderGuide(); }); document.querySelector("#confirmCancel").addEventListener("click", closeConfirmation); document.querySelector("#confirmOkay").addEventListener("click", () => { if (confirmAction && requireAuthenticatedUser()) confirmAction(); });
document.querySelector("#exercisePickerButton").addEventListener("click", () => toggleWorkoutExercisePicker());
document.querySelector("#backToWorkout").addEventListener("click", backToWorkout);
document.querySelector("#saveProfile").addEventListener("click", saveFitnessProfile); document.querySelector("#logWeight").addEventListener("click", logBodyWeight); document.querySelector("#viewDashboard").addEventListener("click", closeWorkoutSummary); document.querySelector("#photoMealButton").addEventListener("click", async () => { const result = await estimateMealFromImage(null); showToast(result.reason, "error"); }); document.querySelector("#profileWeight").addEventListener("input", event => { document.querySelector("#suggestedProtein").textContent = event.target.value ? `${calculateProteinTarget(event.target.value, document.querySelector("#profileGoal").value)} g/day` : "Add body weight"; }); document.querySelector("#profileGoal").addEventListener("change", () => { const weight = document.querySelector("#profileWeight").value; document.querySelector("#suggestedProtein").textContent = weight ? `${calculateProteinTarget(weight, document.querySelector("#profileGoal").value)} g/day` : "Add body weight"; });
document.querySelector("#exerciseSearch").addEventListener("input", event => { const planNames = plans.flatMap(plan => normalizePlanExercises(plan.exercises).map(item => item.exercise)); const allAvailable = dedupeExerciseNames([...favourites, ...planNames, ...exercises]); const workoutAvailable = currentWorkout.mode === "plan" ? dedupeExerciseNames(normalizePlanExercises(currentWorkout.plannedExercises).map(item => item.exercise)) : allAvailable; renderExerciseBrowser(document.querySelector("#workoutExerciseResults"), workoutAvailable, event.target.value, "workout"); });
document.querySelector("#planExerciseName").addEventListener("focus", event => { const panel = document.querySelector("#planExerciseResults"); panel.classList.remove("hidden"); renderExerciseBrowser(panel, dedupeExerciseNames([...favourites, ...exercises, ...plans.flatMap(plan => normalizePlanExercises(plan.exercises).map(item => item.exercise))]), event.target.value, "plan"); });
document.querySelector("#planExerciseName").addEventListener("input", event => { const panel = document.querySelector("#planExerciseResults"); panel.classList.remove("hidden"); renderExerciseBrowser(panel, dedupeExerciseNames([...favourites, ...exercises, ...plans.flatMap(plan => normalizePlanExercises(plan.exercises).map(item => item.exercise))]), event.target.value, "plan"); });
document.querySelector("#duplicateCancel").addEventListener("click", () => resolveDuplicatePlan("cancel")); document.querySelector("#duplicateCreate").addEventListener("click", () => resolveDuplicatePlan("create")); document.querySelector("#duplicateUpdate").addEventListener("click", () => resolveDuplicatePlan("update"));
document.querySelector("#signUp").addEventListener("click", signUp); document.querySelector("#signIn").addEventListener("click", signIn); document.querySelector("#signOut").addEventListener("click", event => { event.stopPropagation(); signOut(); });
document.querySelector("#accountButton").addEventListener("click", openAccountPanel); document.querySelector("#sidebarAccountButton").addEventListener("click", openAccountPanel); document.querySelector("#closeAccount").addEventListener("click", closeAccountPanel); document.querySelector("#closeAccountBackdrop").addEventListener("click", closeAccountPanel);
document.querySelector("#closePrModal").addEventListener("click", closePersonalRecords);
document.querySelector("#prModal").addEventListener("click", event => { if (event.target.id === "prModal") closePersonalRecords(); });
document.querySelectorAll("[data-view-link]").forEach(link => link.addEventListener("click", event => { event.preventDefault(); showView(link.dataset.viewLink); }));
document.addEventListener("keydown", event => { if (event.key === "Escape") { closeConfirmation(); closeDuplicatePlanModal(); closeAccountPanel(); } if (event.key === "Enter" && !document.querySelector("#authGate").classList.contains("hidden") && ["authEmail", "authPassword"].includes(event.target.id)) signIn(); else if (event.key === "Enter" && document.querySelector("#workoutView").classList.contains("active") && ["weightInput", "repsInput"].includes(event.target.id)) addSet(); });

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
function initializePWA() { updateNetworkStatus(); window.addEventListener("online", updateNetworkStatus); window.addEventListener("offline", updateNetworkStatus); if (!("serviceWorker" in navigator)) return; if (["localhost", "127.0.0.1"].includes(location.hostname)) { navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister()))).then(() => caches.keys()).then(keys => Promise.all(keys.filter(key => key.startsWith("lifttrack-shell-")).map(key => caches.delete(key)))).then(() => console.log("DEV: LiftTrack service workers and shell caches cleared for localhost")).catch(error => console.warn("Local service worker cleanup failed:", error)); return; } if (["http:", "https:"].includes(location.protocol)) { let refreshing = false; navigator.serviceWorker.addEventListener("controllerchange", () => { if (refreshing) return; refreshing = true; location.reload(); }); navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).then(registration => registration.update()).catch(error => console.warn("Service worker registration failed:", error)); } }

try { initializePWA(); } catch (error) { console.error("PWA initialization failed:", error); }
initializeSupabase().catch(error => { console.error("Unexpected startup failure:", error); authState = "signed_out"; authenticatedUser = null; showAuthenticationScreen(); showToast("LiftTrack could not finish starting. Please try again.", "error"); });
