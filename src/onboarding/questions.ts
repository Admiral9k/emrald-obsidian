// The 13 profile questions (simple mode). One source for the onboarding questions step; reassessment.ts keeps its own
// pre-filled copy. Nothing is pre-answered: a blank stays blank and is never saved.
import { WORK_TYPES } from './copy';

export type Opt = { value: string; label: string; desc?: string };
export type Question = {
	key: string;
	question: string;
	type: 'scale' | 'enum';
	options?: Opt[];
	low?: string;
	high?: string;
};

const WORK_KEYS = ['wonder', 'invention', 'discernment', 'galvanizing', 'enablement', 'tenacity'];
const energyOpts: Opt[] = WORK_KEYS.map((k) => ({ value: k, label: WORK_TYPES[k].label, desc: WORK_TYPES[k].energy }));
const drainOpts: Opt[] = WORK_KEYS.map((k) => ({ value: k, label: WORK_TYPES[k].label, desc: WORK_TYPES[k].drain }));

export const QUESTIONS: Question[] = [
	{
		key: 'chronotype', question: 'When do you do your best, most focused work?', type: 'enum',
		options: [
			{ value: 'very_early', label: 'Very early (3\u20135am)' },
			{ value: 'early_morning', label: 'Early morning (5\u20138am)' },
			{ value: 'mid_morning', label: 'Mid-morning (8\u201311am)' },
			{ value: 'afternoon', label: 'Afternoon (12\u20134pm)' },
			{ value: 'evening', label: 'Evening (5\u20139pm)' },
			{ value: 'late_night', label: 'Late night (10pm\u20132am)' },
		],
	},
	{
		key: 'work_pace_style', question: 'Do you prefer to work in intense bursts with breaks, or steady?', type: 'enum',
		options: [
			{ value: 'burst', label: 'Intense bursts with breaks' },
			{ value: 'mix', label: 'A mix of both' },
			{ value: 'steady', label: 'Steady and consistent' },
		],
	},
	{
		key: 'social_energy_direction', question: 'After a day of socializing, I feel...', type: 'enum',
		options: [
			{ value: 'energized', label: 'Energized: people charge me up' },
			{ value: 'neutral', label: 'Neutral: depends on the people' },
			{ value: 'drained', label: 'Drained: I need alone time to recharge' },
		],
	},
	{ key: 'sleep_quality_baseline', question: 'In general, how well do you sleep?', type: 'scale' },
	{ key: 'conscientiousness', question: 'I see myself as someone who is organized and follows through...', type: 'scale' },
	{ key: 'stress_vulnerability', question: 'I get stressed easily and worry about things going wrong.', type: 'scale' },
	{ key: 'novelty_tolerance', question: 'I\u2019m energized by trying new things and tackling unfamiliar challenges.', type: 'scale' },
	{ key: 'routine_tolerance', question: 'I can do routine, repetitive work for long stretches without losing focus.', type: 'scale' },
	{ key: 'procrastination_tendency', question: 'How often do you delay starting tasks you\u2019ve committed to?', type: 'scale', low: 'Rarely', high: 'Often' },
	{
		key: 'procrastination_trigger', question: 'When you procrastinate, it\u2019s usually because...', type: 'enum',
		options: [
			{ value: 'boring', label: 'The task is boring' },
			{ value: 'uncertain', label: 'I\u2019m unsure how to start' },
			{ value: 'fear', label: 'Fear of failure or judgment' },
			{ value: 'tired', label: 'I\u2019m just tired' },
			{ value: 'distracted', label: 'I get distracted easily' },
			{ value: 'overwhelmed', label: 'It feels too big' },
		],
	},
	{ key: 'working_genius_primary', question: 'Which type of work energizes you MOST?', type: 'enum', options: energyOpts },
	{ key: 'working_frustration_primary', question: 'Which type of work DRAINS you MOST?', type: 'enum', options: drainOpts },
	{ key: 'autonomy_satisfaction', question: 'How much control do you feel over your daily choices?', type: 'scale' },
];

// Pages of 4, 5 and 4 questions, so every page reads "Questions {a}\u2013{b} of 13".
export const PAGE_BOUNDS: Array<[number, number]> = [[0, 4], [4, 9], [9, 13]];

export function progressLine(template: string, page: number): string {
	return template.replace('{a}', String(PAGE_BOUNDS[page][0] + 1)).replace('{b}', String(PAGE_BOUNDS[page][1]));
}
