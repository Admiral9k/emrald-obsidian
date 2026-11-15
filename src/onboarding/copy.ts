// Onboarding copy deck (plugin). MASTER COPY: LLC-Brain/_wiki/engine/briefs/onboarding-plan-2026-11.md (v3), section 5.
// The web app holds the same strings in src/lib/onboarding-copy.ts (Emrald-freed-main).
// scripts/test-onboarding-copy-parity.cjs asserts the two decks match; the only allowed differences are listed there
// (PRO vs Pro, Settings vs Profile). Change a line in the deck first, then in both files.
// No em-dashes. En-dashes only in number ranges (written as \u2013).

export const COPY: Record<string, string> = {
	// 5a. Signup and ready screen
	'welcome.title': 'Welcome to EMRALD',
	'welcome.body':
		'Start a session when you begin work. EMRALD keeps the time. When you stop, rate the session to get your receipt: five quick questions about how it felt. Your record builds from there.',
	'welcome.bullets.1': 'Time your work sessions',
	'welcome.bullets.2': 'See how long things really take',
	'welcome.bullets.3': 'Spot what drains you',
	'welcome.bullets.4': 'A burnout score from your own numbers',
	'welcome.cta': 'Get started',
	'connect.body': 'Paste your API key from the web app. It takes about a minute.',
	'connect.cta': 'Connect',
	'connect.skip': 'Skip for now',
	'connect.privacy': 'EMRALD syncs session times, effort ratings, check-ins and project names. Your note content stays in your vault.',
	'project.title': 'Add your first project',
	'project.body':
		'What are you working on? Pick an effort level for it: Light, Moderate, Demanding, or Maximum. It sets how much of your work hours the project takes.',
	'project.what':
		'Think of it as anything worth dedicating focused time to: your novel, your certification prep, a weekly meal-planning routine, learning a new song on piano. Not your grocery list.',
	'project.cap': 'You can have up to 5 active projects at a time, on any plan.',
	'project.required': 'Add a project to continue.',
	'project.legend.1': 'Light (E1): 25% of your work hours.',
	'project.legend.2': 'Moderate (E2): 50% of your work hours.',
	'project.legend.3': 'Demanding (E3): 75% of your work hours.',
	'project.legend.4': 'Maximum (E4): 100% of your work hours.',
	'project.noteLink':
		'Tip: click the link icon to connect a project to an existing note. EMRALD syncs session data to that note. Without a link, the project lives only in your project list.',
	'ready.title': 'Ready when you are',
	'ready.hours': 'About how many hours a day do you spend on work you want to track?',
	'ready.hours.hint': 'You can change this any time.',
	'ready.short': 'Sessions under 5 minutes skip the receipt and still count.',
	'ready.cta': 'Start your first session',

	// 5b. First-receipt celebration
	'cel.title': 'First receipt filed.',
	'cel.win': "That's your first receipt, and it already counts in your numbers.",
	'cel.numbers': 'Your numbers: receipts fill them in. 8 free, all 20 with PRO.',
	'cel.checkin':
		'Daily check-in: about 15 seconds. Sleep, energy, and how your body and mind feel. Skip any day you like.',
	'cel.burnout':
		'Burnout score: if it gets high, you get a gentle heads-up and a reminder of something that recharges you.',
	'cel.closer': 'Keep filling in your receipts for a month and the full picture is yours.',
	'cel.cta': 'Got it',

	// 5d. Profile questions and their steps (reached from Effort Profile and the command palette)
	'card.title': 'Fill in your profile',
	'card.body':
		'Answer a few questions and EMRALD can show how your answers line up with what your receipts show.',
	'card.cta': 'Answer a few questions',
	'card.dismiss': 'Not now',
	'questions.title': 'A few questions about you',
	'questions.body':
		'There are no wrong answers. Your answers set up your effort profile: a picture of how you tend to work.',
	'questions.progress': 'Questions {a}\u2013{b} of 13',
	'questions.skip': 'Skip for now',
	'recharge.title': 'What recharges you?',
	'recharge.body':
		'Activities that restore your energy, like walking, piano, or reading. If your burnout score gets high, EMRALD reminds you of something from this list.',
	'recharge.label': 'Add up to 3 things that recharge you',
	'recharge.hint': 'Optional. You can add them later.',
	'recharge.skip': 'Skip',
	'card.done': 'Thanks. Your profile is more filled in now.',
	'optin.line':
		'Share anonymous usage data to help improve EMRALD. You can change this anytime in Settings.',
};

// 5f. Work types in plain words (display labels only; stored keys are unchanged).
export const WORK_TYPES: Record<string, { label: string; energy: string; drain: string }> = {
	wonder: {
		label: 'Big-picture ideas',
		energy: 'Asking big questions and imagining what could be',
		drain: 'Thinking in the abstract with nothing to act on',
	},
	invention: {
		label: 'Creating new things',
		energy: 'Making up new solutions and ideas',
		drain: 'Starting from a blank page',
	},
	discernment: {
		label: 'Giving feedback',
		energy: "Spotting what works and what doesn't",
		drain: "Having to critique other people's work",
	},
	galvanizing: {
		label: 'Rallying people',
		energy: 'Getting a group moving on something',
		drain: 'Keeping a group on track when they lose steam',
	},
	enablement: {
		label: 'Helping others',
		energy: 'Backing other people up so they succeed',
		drain: "Putting your own work aside for other people's priorities",
	},
	tenacity: {
		label: 'Finishing things',
		energy: 'Getting tasks over the line',
		drain: 'Grinding through repetitive details',
	},
};

/** Plain label for a stored work-type key; unknown keys pass through unchanged. */
export function workTypeLabel(key: string): string {
	return WORK_TYPES[key]?.label ?? key;
}

/** "Label: description" options for the single-line pickers (Retake the questions). */
export function workTypeOptions(kind: 'energy' | 'drain'): Array<{ value: string; label: string }> {
	return Object.keys(WORK_TYPES).map((k) => ({ value: k, label: `${WORK_TYPES[k].label}: ${WORK_TYPES[k][kind]}` }));
}

/** Effort-level options for the first-project select (names from the legend; code as a tag). */
export const LEVEL_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: 'E1', label: 'Light (E1)' },
	{ value: 'E2', label: 'Moderate (E2)' },
	{ value: 'E3', label: 'Demanding (E3)' },
	{ value: 'E4', label: 'Maximum (E4)' },
];
