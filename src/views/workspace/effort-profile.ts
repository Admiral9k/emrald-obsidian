// EMRALD Effort Profile — View and manage personal calibration.
// Shows: current calibration scores, profile mode, all answered questions,
// profile history timeline, D19 drift indicator, reassessment trigger.
// Obsidian-native: ungrouped answer cards, clean trait bars, warm language.

import { WorkspaceLeaf, Notice, Modal, Setting, setIcon, App } from 'obsidian';
import EmraldPlugin from '../../../main';
import { EmraldWorkspaceView, VIEW_EFFORT_PROFILE, VIEW_DATA_CENTER } from './base';
import { RecoveryProtocol } from '../../api/client';

// ── Calibration Fields (core 6) ─────────────────────────

const CORE_TRAITS = [
	{ key: 'physical_capability',   label: 'Physical Capability',     desc: 'Your physical work capacity', icon: 'dumbbell' },
	{ key: 'mental_capability',     label: 'Mental Capability',       desc: 'Cognitive endurance and processing', icon: 'brain' },
	{ key: 'physical_novel_endurance', label: 'Physical Endurance',   desc: 'How long you sustain physical effort', icon: 'timer' },
	{ key: 'mental_abstract_endurance', label: 'Mental Endurance',    desc: 'How long you sustain cognitive effort', icon: 'clock' },
	{ key: 'motivation_personal',   label: 'Intrinsic Motivation',    desc: 'Drive from internal interest/passion', icon: 'heart' },
	{ key: 'motivation_job',        label: 'Extrinsic Motivation',    desc: 'Drive from external rewards/deadlines', icon: 'trophy' }
];

// ── Calibration Question Labels ─────────────────────────
// These match the onboarding + advanced calibration question keys.
// Deliberately ungrouped per EFFORTS-TAB-SPEC (prevents reverse-engineering).

const QUESTION_LABELS: Record<string, { label: string; format: 'slider' | 'enum' | 'text' }> = {
	// Onboarding (13 questions)
	chronotype:                  { label: 'When do you do your best, most focused work?', format: 'enum' },
	work_pace_style:             { label: 'Do you prefer intense bursts or steady work?', format: 'enum' },
	social_energy_direction:     { label: 'After socializing, I feel...', format: 'enum' },
	sleep_quality_baseline:      { label: 'In general, how well do you sleep?', format: 'slider' },
	conscientiousness:           { label: "I'm organized and follow through", format: 'slider' },
	stress_vulnerability:        { label: 'I get stressed easily', format: 'slider' },
	novelty_tolerance:           { label: "I'm energized by new challenges", format: 'slider' },
	routine_tolerance:           { label: 'I can do routine work for long stretches', format: 'slider' },
	procrastination_tendency:    { label: 'How often do you delay starting tasks?', format: 'slider' },
	procrastination_trigger:     { label: "When you procrastinate, it's usually because...", format: 'enum' },
	working_genius_primary:      { label: 'Which type of work energizes you most?', format: 'enum' },
	working_frustration_primary: { label: 'Which type of work drains you most?', format: 'enum' },
	autonomy_satisfaction:       { label: 'How much control over your daily choices?', format: 'slider' },
	// Advanced (30 questions)
	interest_consistency:        { label: 'I often set goals but later pursue different ones', format: 'slider' },
	achievement_drive:           { label: 'I maintain effort on long projects even when progress is slow', format: 'slider' },
	impulsiveness:               { label: 'I tend to act on impulse', format: 'slider' },
	structure_preference:        { label: 'I prefer clear plans over flexible situations', format: 'slider' },
	delegation_comfort:          { label: 'I find it easy to delegate work', format: 'slider' },
	decision_style:              { label: 'I prioritize logical consistency over impact on people', format: 'slider' },
	core_motivation:             { label: "I'm driven by a desire for...", format: 'enum' },
	stress_pattern_primary:      { label: 'When overwhelmed, my first response is to...', format: 'enum' },
	competition_response:        { label: 'Competitive situations make me...', format: 'enum' },
	stimulation_need:            { label: 'I need regular variety to stay engaged', format: 'slider' },
	ambiguity_tolerance:         { label: "I'm comfortable with ambiguity", format: 'slider' },
	enablement_tendency:         { label: "I find supporting others' projects fulfilling", format: 'slider' },
	competence_satisfaction:     { label: 'How confident with unfamiliar challenges?', format: 'slider' },
	relatedness_satisfaction:    { label: 'How connected to people who depend on your work?', format: 'slider' },
	physical_fitness_baseline:   { label: 'How would you rate your physical fitness?', format: 'slider' },
	max_sustained_project_duration: { label: "Longest project you've sustained consistent effort on?", format: 'enum' },
	focus_session_capacity:      { label: 'Hours of focused work before quality drops?', format: 'enum' },
	recovery_rate:               { label: 'After intense 90-min session, recharge time?', format: 'enum' },
	life_domains_count:          { label: 'How many life areas do you actively manage?', format: 'enum' },
	overcommitment_tendency:     { label: "How often do you feel like you're juggling too much?", format: 'slider' },
	task_switching_preference:   { label: '4 different tasks or 1 deep task?', format: 'enum' },
	purpose_sensitivity:         { label: 'How important is it that work feels meaningful?', format: 'slider' },
	flow_activities:             { label: 'Activities that put you in deep focus most easily', format: 'text' },
	avoidance_pattern:           { label: 'Task type you most consistently avoid', format: 'text' },
	natural_gravitation:         { label: 'On a free day, what do you do first?', format: 'text' },
	current_frustration:         { label: 'Biggest productivity frustration right now', format: 'text' },
	imported_mbti:               { label: 'MBTI type', format: 'text' },
	imported_enneagram:          { label: 'Enneagram type', format: 'text' },
	imported_clifton_top5:       { label: 'CliftonStrengths top 5', format: 'text' }
};

// ── Explicit 5-point scales for slider questions ────────
// Each key maps to [1, 2, 3, 4, 5] display text.
// This avoids awkward combos like "Somewhat very often".

const SLIDER_SCALES: Record<string, [string, string, string, string, string]> = {
	sleep_quality_baseline:      ['Very poorly', 'Poorly', 'Okay', 'Well', 'Very well'],
	conscientiousness:           ['Rarely', 'Sometimes', 'Often', 'Usually', 'Always'],
	stress_vulnerability:        ['Rarely', 'Occasionally', 'Sometimes', 'Easily', 'Very easily'],
	novelty_tolerance:           ['Not at all', 'A little', 'Moderately', 'Quite a bit', 'Very much'],
	routine_tolerance:           ['Really struggle', 'Struggle', "It's okay", 'Fairly easily', 'Easily'],
	procrastination_tendency:    ['Rarely', 'Occasionally', 'Sometimes', 'Often', 'Very often'],
	autonomy_satisfaction:       ['Very little', 'Some', 'Moderate', 'A lot', 'Complete'],
	interest_consistency:        ['Rarely', 'Occasionally', 'Sometimes', 'Often', 'Very often'],
	achievement_drive:           ['Rarely', 'Sometimes', 'Often', 'Usually', 'Always'],
	impulsiveness:               ['Rarely', 'Occasionally', 'Sometimes', 'Often', 'Very often'],
	structure_preference:        ['Disagree', 'Slightly disagree', 'Neutral', 'Agree', 'Strongly agree'],
	delegation_comfort:          ['Very difficult', 'Difficult', 'Neutral', 'Fairly easy', 'Very easy'],
	decision_style:              ['People first', 'Lean people', 'Balanced', 'Lean logic', 'Logic first'],
	stimulation_need:            ['Not really', 'A little', 'Moderately', 'Quite a bit', 'Absolutely'],
	ambiguity_tolerance:         ['Very uncomfortable', 'Uncomfortable', 'Neutral', 'Comfortable', 'Very comfortable'],
	enablement_tendency:         ['Not really', 'A little', 'Somewhat', 'Quite a bit', 'Very much'],
	competence_satisfaction:     ['Not confident', 'Slightly confident', 'Moderately confident', 'Confident', 'Very confident'],
	relatedness_satisfaction:    ['Very disconnected', 'Disconnected', 'Neutral', 'Connected', 'Very connected'],
	physical_fitness_baseline:   ['Poor', 'Below average', 'Average', 'Good', 'Excellent'],
	overcommitment_tendency:     ['Rarely', 'Occasionally', 'Sometimes', 'Often', 'Constantly'],
	purpose_sensitivity:         ['Not important', 'Slightly important', 'Moderately important', 'Important', 'Essential']
};

// ── Enum display labels ─────────────────────────────────
// Maps stored enum values to human-readable text.
// Prevents issues like "3_4h" → "3 4h" from naive underscore replacement.

const ENUM_DISPLAY: Record<string, string> = {
	// Chronotype
	early_morning: 'Early Morning', mid_morning: 'Mid-Morning', afternoon: 'Afternoon',
	evening: 'Evening', late_night: 'Late Night',
	// Work pace
	burst: 'Intense Bursts', mix: 'Mix', steady: 'Steady',
	// Social energy
	energized: 'Energized', neutral: 'Neutral', drained: 'Drained',
	// Procrastination trigger
	boring: 'The task is boring', uncertain: 'Unsure how to start',
	fear: 'Fear of failure', tired: 'Just tired',
	distracted: 'Get distracted easily', overwhelmed: 'Overwhelmed',
	// Working genius/frustration
	wonder: 'Wonder', invention: 'Invention', discernment: 'Discernment',
	galvanizing: 'Galvanizing', enablement: 'Enablement', tenacity: 'Tenacity',
	// Core motivation
	correctness: 'Correctness', helping: 'Helping', achievement: 'Achievement',
	authenticity: 'Authenticity', understanding: 'Understanding',
	security: 'Security', experience: 'Experience', autonomy: 'Autonomy', peace: 'Peace',
	// Stress pattern
	withdraw: 'Withdraw', over_prepare: 'Over-Prepare', push_harder: 'Push Harder',
	scatter: 'Scatter', become_critical: 'Become Critical',
	// Competition
	uncomfortable: 'Uncomfortable',
	// Focus session capacity
	under_1h: 'Under 1h', '1_2h': '1–2h', '2_3h': '2–3h', '3_4h': '3–4h', over_4h: 'Over 4h',
	// Recovery rate
	'15min': '15min', '30min': '30min', '1h': 'About an hour', over_2h: 'Over 2h',
	// Life domains
	'2_3': '2–3 areas', '4_5': '4–5 areas', '6_7': '6–7 areas', '8_plus': '8+',
	// Duration
	days: 'Days', weeks: 'Weeks', months: 'Months', years: 'Years',
	// Task switching
	'4_tasks': '4 Different Tasks', '1_deep': '1 Deep Task'
};

export class EffortProfileView extends EmraldWorkspaceView {
	constructor(leaf: WorkspaceLeaf, plugin: EmraldPlugin) {
		super(leaf, plugin, 'Effort profile');
	}

	getViewType(): string { return VIEW_EFFORT_PROFILE; }

	async onOpen() {
		const container = this.getContainer();
		this.renderHeader(container, 'Effort profile', 'How EMRALD sees you', 'user');

		// Fetch data concurrently
		let profileResp, historyResp, metricsResp, recoveryResp, d19HistoryResp;
		try {
			const forceFresh = !this.isOffline();
			[profileResp, historyResp, metricsResp, recoveryResp, d19HistoryResp] = await Promise.all([
				this.plugin.apiClient.getProfile({ skipCache: forceFresh }),
				this.plugin.apiClient.getProfileHistory({ skipCache: forceFresh }),
				this.plugin.apiClient.getMetrics(['D19'], { skipCache: forceFresh }),
				this.plugin.apiClient.getRecoveryProtocols({ skipCache: forceFresh }),
				this.plugin.apiClient.getMetricHistory('D19', undefined, undefined, 2, { skipCache: forceFresh })
			]);
		} catch {
			this.renderError(container, 'Could not load effort profile — check your connection.');
			return;
		}

		const profile = profileResp.data as Record<string, unknown> | null;
		const recoveryProtocols = (recoveryResp.data ?? []);

		// Offline: if profile fetch failed with no data and no cache, show offline message (P15 fix)
		if (profile === null && (profileResp.status === 0 || profileResp.error)) {
			this.renderError(container, 'Offline — your effort profile will load when you reconnect.');
			return;
		}

		// Stale data banner when showing cached data offline (P15 fix)
		const anyFromCache = profileResp.fromCache || historyResp.fromCache || metricsResp.fromCache || recoveryResp.fromCache;
		if (anyFromCache || this.isOffline()) {
			this.renderStaleBanner(container);
		}

		// ── D19 Drift Indicator ──
		// Only show drift warning/indicator when confidence_stage is 'established' (≥16 sessions).
		// During early/building stages, show an informational note instead.
		// Also suppress if user reassessed after D19 was last computed (stale warning).
		const d19 = metricsResp.data?.find(m => m.metric_key === 'D19');
		const d19Metadata = (d19?.metadata ?? {});
		const confidenceStageD19 = (d19Metadata.confidence_stage as string | undefined) ?? null;
		const lastReassessmentAt = typeof profile?.last_reassessment_at === 'string'
			? profile.last_reassessment_at
			: null;
		const d19ComputedAt = d19?.computed_at ?? null;
		const d19StaleAfterReassessment = lastReassessmentAt && d19ComputedAt
			? new Date(lastReassessmentAt) > new Date(d19ComputedAt)
			: false;
		const d19Established = confidenceStageD19 === 'established';

		if (d19 && d19.value !== null && d19Established && !d19StaleAfterReassessment) {
			this.renderDriftIndicator(container, d19.value, d19Metadata);
		} else if (d19 && d19.value !== null && !d19Established) {
			// Informational note: not enough data yet
			this.renderDriftPending(container, d19Metadata);
		}

		// ── Profile Mode Banner ──
		if (profile) {
			this.renderModeBanner(container, profile);
		}

		// ── Core Trait Bars ──
		if (profile) {
			this.renderCoreTraits(container, profile);
		} else {
			this.renderEmptyState(container);
			// Don't return early — still render recharge activities and actions below
		}

		// ── Recharge Activities ──
		this.renderRecoveryActivities(container, recoveryProtocols);

		// ── Calibration Score ──
		if (profile) this.renderCalibrationScore(container, profile);

		// ── All Answered Questions (ungrouped cards) ──
		if (profile) {
			// Only highlight per-question drift nudges when D19 is established
			const driftLevel = d19Established && !d19StaleAfterReassessment ? (d19?.value ?? 0) : 0;
			this.renderAnsweredQuestions(container, profile, driftLevel);
		}

		// ── Profile History ──
		if (historyResp.data && historyResp.data.length > 0) {
			this.renderHistory(container, historyResp.data);
		}

		// ── Actions ──
		if (profile) this.renderActions(container, profile);

		// ── Cross-link to Data Center ──
		this.renderDataCenterLink(container);
	}

	// ── Empty State ─────────────────────────────────────

	private renderEmptyState(container: Element) {
		const empty = container.createDiv({ cls: 'emerald-wv-empty-state' });

		const iconEl = empty.createDiv({ cls: 'emerald-wv-empty-icon' });
		setIcon(iconEl, 'user');

		empty.createEl('h3', { text: 'No profile data yet' });
		empty.createEl('p', {
			cls: 'emerald-wv-empty-desc',
			text: 'Complete the calibration questions during onboarding or at the start of your next session. Your effort profile helps EMRALD calibrate everything to you.'
		});

		const btn = empty.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Start calibration'
		});
		btn.addEventListener('click', () => { void (async () => {
			try {
				await this.plugin.apiClient.triggerReassessment();
				new Notice('Calibration started');
			} catch { /* non-fatal */ }
		})(); });
	}

	// ── D19 Drift Indicator ─────────────────────────────

	private renderDriftIndicator(container: Element, driftValue: number, metadata: Record<string, unknown> = {}) {
		const confidenceStage = (metadata.confidence_stage as string | undefined) ?? 'established';
		const confidenceFactor = typeof metadata.confidence_factor === 'number' ? metadata.confidence_factor : null;
		const sessionCount = typeof metadata.session_count === 'number' ? metadata.session_count : null;
		const rawDrift = typeof metadata.raw_drift === 'number' ? metadata.raw_drift : driftValue;

		let level: string, msg: string, cls: string, icon: string;

		if (confidenceStage === 'early') {
			level = 'Early Signal';
			msg = 'EMRALD is just starting to compare your profile against real-world effort data. This is an early read, not a warning yet.';
			cls = 'emerald-wv-drift-low';
			icon = 'sparkles';
		} else if (confidenceStage === 'building') {
			if (driftValue < 1.5) {
				level = 'Review Suggested';
				msg = 'Your profile and your recent effort data are showing some mismatch. As more sessions come in, EMRALD will tighten its expectations.';
				cls = 'emerald-wv-drift-moderate';
				icon = 'alert-circle';
			} else {
				level = 'Review Suggested';
				msg = 'Your recent effort patterns are diverging from your calibration enough that a review may help — but EMRALD is still building confidence.';
				cls = 'emerald-wv-drift-moderate';
				icon = 'alert-circle';
			}
		} else if (driftValue < 1.0) {
			level = 'Aligned';
			msg = 'Your calibration still appears to match your recent effort patterns.';
			cls = 'emerald-wv-drift-low';
			icon = 'check-circle';
		} else if (driftValue < 2.5) {
			level = 'Review Suggested';
			msg = "Your profile and your actual effort patterns may be drifting apart. A review could improve EMRALD's recommendations.";
			cls = 'emerald-wv-drift-moderate';
			icon = 'alert-circle';
		} else {
			level = 'Warning';
			msg = 'Your calibration and observed effort patterns are meaningfully out of alignment. A reassessment would likely improve insight quality.';
			cls = 'emerald-wv-drift-high';
			icon = 'alert-triangle';
		}

		const indicator = container.createDiv({ cls: `emerald-wv-section emerald-wv-drift-indicator ${cls}` });

		const headerRow = indicator.createDiv({ cls: 'emerald-wv-drift-header-row' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-drift-icon' });
		setIcon(iconEl, icon);
		headerRow.createSpan({
			cls: 'emerald-wv-drift-title',
			text: `D19 Calibration Drift: ${level}`
		});
		headerRow.createSpan({ cls: 'emerald-wv-drift-value', text: `(${driftValue.toFixed(2)})` });

		indicator.createEl('p', { cls: 'emerald-wv-drift-msg', text: msg });

		const metaBits: string[] = [];
		if (sessionCount !== null) metaBits.push(`${sessionCount} recent sessions`);
		if (confidenceFactor !== null) metaBits.push(`confidence ${Math.round(confidenceFactor * 100)}%`);
		if (rawDrift !== driftValue) metaBits.push(`raw drift ${rawDrift.toFixed(2)}`);
		if (metaBits.length > 0) {
			indicator.createEl('p', {
				cls: 'emerald-wv-section-note',
				text: metaBits.join(' • ')
			});
		}
	}

	// ── D19 Drift Pending (not enough data yet) ────────

	private renderDriftPending(container: Element, metadata: Record<string, unknown> = {}) {
		const sessionCount = typeof metadata.session_count === 'number' ? metadata.session_count : 0;
		const sessionsNeeded = Math.max(0, 16 - sessionCount);

		const section = container.createDiv({ cls: 'emerald-wv-section emerald-wv-drift-indicator emerald-wv-drift-pending' });

		const headerRow = section.createDiv({ cls: 'emerald-wv-drift-header-row' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-drift-icon' });
		setIcon(iconEl, 'sparkles');
		headerRow.createSpan({
			cls: 'emerald-wv-drift-title',
			text: 'Calibration Drift (D19) — Collecting Data'
		});

		section.createEl('p', {
			cls: 'emerald-wv-drift-msg',
			text: `EMRALD needs about ${sessionsNeeded} more session${sessionsNeeded === 1 ? '' : 's'} before it can meaningfully compare your profile against real-world effort patterns. This typically takes a couple of weeks of regular use.`
		});

		section.createEl('p', {
			cls: 'emerald-wv-section-note',
			text: `${sessionCount} of ~16 sessions recorded`
		});

		// Still show the Data Center link
		const link = section.createDiv({ cls: 'emerald-wv-cross-link' });
		const anchor = link.createEl('a', {
			cls: 'emerald-wv-cross-link-text',
			text: 'View raw d19 data in data center \u2192'
		});
		anchor.addEventListener('click', (e) => {
			e.preventDefault();
			void this.plugin.openWorkspaceView(VIEW_DATA_CENTER);
		});
	}

	// ── Profile Mode Banner ─────────────────────────────

	private renderModeBanner(container: Element, profile: Record<string, unknown>) {
		const mode = (profile.question_mode as string) ?? 'simple';
		const banner = container.createDiv({ cls: 'emerald-wv-profile-mode' });

		const modeIcon = banner.createSpan({ cls: 'emerald-wv-profile-mode-icon' });
		setIcon(modeIcon, mode === 'advanced' ? 'sparkles' : 'circle');

		banner.createSpan({
			cls: 'emerald-wv-profile-mode-label',
			text: mode === 'advanced' ? 'Advanced Profile' : 'Simple Profile'
		});

		if (mode === 'simple') {
			const upgradeBtn = banner.createEl('button', {
				cls: 'emerald-btn emerald-btn-subtle emerald-btn-sm',
				text: 'Upgrade to advanced'
			});
			upgradeBtn.addEventListener('click', () => { void (async () => {
				try {
					await this.plugin.apiClient.updateProfile({ question_mode: 'advanced' });
					new Notice('Advanced mode enabled! Questions will appear before your next session.');
					void this.onOpen(); // Refresh
				} catch { /* non-fatal */ }
			})(); });
		}

		// Show advanced question progress
		if (mode === 'advanced') {
			const remaining = (profile.advanced_questions_remaining as number) ?? 30;
			const total = 30;
			const answered = total - remaining;

			if (remaining > 0) {
				banner.createSpan({
					cls: 'emerald-wv-profile-progress-text',
					text: `${answered}/${total} advanced questions answered`
				});
			} else {
				banner.createSpan({
					cls: 'emerald-wv-profile-progress-text emerald-wv-profile-complete',
					text: 'All questions answered ✓'
				});
			}
		}
	}

	// ── Core Trait Bars ─────────────────────────────────

	private renderCoreTraits(container: Element, profile: Record<string, unknown>) {
		const section = container.createDiv({ cls: 'emerald-wv-section' });

		const headerRow = section.createDiv({ cls: 'emerald-wv-section-header-row' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-section-icon' });
		setIcon(iconEl, 'sliders');
		headerRow.createEl('h3', { text: 'Core traits' });

		const traitsEl = section.createDiv({ cls: 'emerald-wv-traits' });

		for (const trait of CORE_TRAITS) {
			const value = typeof profile[trait.key] === 'number' ? profile[trait.key] as number : null;

			const row = traitsEl.createDiv({ cls: 'emerald-wv-trait-row' });

			const labelCol = row.createDiv({ cls: 'emerald-wv-trait-label' });
			const nameRow = labelCol.createDiv({ cls: 'emerald-wv-trait-name-row' });
			const traitIcon = nameRow.createSpan({ cls: 'emerald-wv-trait-icon' });
			setIcon(traitIcon, trait.icon);
			nameRow.createSpan({ cls: 'emerald-wv-trait-name', text: trait.label });
			labelCol.createSpan({ cls: 'emerald-wv-trait-desc', text: trait.desc });

			const barContainer = row.createDiv({ cls: 'emerald-wv-trait-bar-container' });

			if (value !== null) {
				const bar = barContainer.createDiv({ cls: 'emerald-wv-trait-bar' });
				const fill = bar.createDiv({ cls: 'emerald-wv-trait-bar-fill' });
				fill.style.width = `${Math.min(value * 10, 100)}%`;
				barContainer.createSpan({ cls: 'emerald-wv-trait-value', text: value.toFixed(1) });
			} else {
				barContainer.createSpan({ cls: 'emerald-wv-empty', text: 'Not yet calibrated' });
				barContainer.createSpan({
					cls: 'emerald-wv-trait-hint',
					text: 'Builds after ~1 week of sessions and check-ins'
				});
			}
		}
	}

	// ── Recharge Activities ─────────────────────────────

	private renderRecoveryActivities(container: Element, protocols: RecoveryProtocol[]) {
		const section = container.createDiv({ cls: 'emerald-wv-section emerald-wv-recovery-section' });

		const headerRow = section.createDiv({ cls: 'emerald-wv-section-header-row' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-section-icon' });
		setIcon(iconEl, 'heart-pulse');
		headerRow.createEl('h3', { text: 'What recharges you?' });

		const placeholders = [
			'A walk without your phone...',
			'Reading something just for fun...',
			'Playing music, cooking, gardening...'
		];

		// Show up to 3 slots — fill with existing protocols, leave rest as empty slots
		const slots = 3;
		const activeProtocols = protocols.filter(p => p.is_active !== false);

		const grid = section.createDiv({ cls: 'emerald-wv-recovery-grid' });

		for (let i = 0; i < slots; i++) {
			const protocol = activeProtocols[i];
			const card = grid.createDiv({ cls: 'emerald-wv-recovery-card' });

			if (protocol) {
				// Filled card
				card.createDiv({ cls: 'emerald-wv-recovery-name', text: protocol.name });
				if (protocol.description) {
					card.createDiv({ cls: 'emerald-wv-recovery-desc', text: protocol.description });
				}

				// Edit on click
				card.addClass('emerald-wv-recovery-card-filled');
				card.addEventListener('click', () => this.editRecoveryProtocol(protocol, card));
			} else {
				// Empty slot
				card.addClass('emerald-wv-recovery-card-empty');
				const addIcon = card.createSpan({ cls: 'emerald-wv-recovery-add-icon' });
				setIcon(addIcon, 'plus');
				card.createDiv({ cls: 'emerald-wv-recovery-placeholder', text: placeholders[i] ?? 'Add an activity...' });

				card.addEventListener('click', () => this.addRecoveryProtocol(card, placeholders[i]));
			}
		}

		section.createEl('p', {
			cls: 'emerald-wv-recovery-note',
			text: 'These activities will be suggested when your effort patterns show signs of strain.'
		});
	}

	private addRecoveryProtocol(card: Element, placeholder: string) {
		const modal = new RecoveryInputModal(this.plugin.app, 'Add recovery activity', '', (name) => {
			void (async () => {
				const resp = await this.plugin.apiClient.createRecoveryProtocol(name.trim());
				if (resp.queued) {
					new Notice('Recovery activity queued — will sync when online');
				} else if (resp.data) {
					new Notice('Recovery activity saved.');
					await this.onOpen();
				} else {
					new Notice('Failed to save — try again.');
				}
			})();
		});
		modal.open();
	}

	private editRecoveryProtocol(protocol: RecoveryProtocol, card: Element) {
		const modal = new RecoveryInputModal(this.plugin.app, 'Edit recovery activity', protocol.name, (name) => {
			void (async () => {
				if (name.trim() === '') {
					// Empty = delete
					const delResp = await this.plugin.apiClient.deleteRecoveryProtocol(protocol.id);
					new Notice(delResp.queued ? 'Deletion queued — will sync when online' : 'Recovery activity removed.');
					if (!delResp.queued) await this.onOpen();
					return;
				}

				if (name.trim() !== protocol.name) {
					const updResp = await this.plugin.apiClient.updateRecoveryProtocol(protocol.id, { name: name.trim() });
					new Notice(updResp.queued ? 'Update queued — will sync when online' : 'Recovery activity updated.');
					if (!updResp.queued) await this.onOpen();
				}
			})();
		});
		modal.open();
	}

	// ── Calibration Score ───────────────────────────────

	private renderCalibrationScore(container: Element, profile: Record<string, unknown>) {
		if (typeof profile.calibration_score !== 'number') return;

		const section = container.createDiv({ cls: 'emerald-wv-section emerald-wv-cal-score-section' });

		const headerRow = section.createDiv({ cls: 'emerald-wv-section-header-row' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-section-icon' });
		setIcon(iconEl, 'target');
		headerRow.createEl('h3', { text: 'Calibration score' });

		const scoreRow = section.createDiv({ cls: 'emerald-wv-cal-score-row' });
		scoreRow.createSpan({ cls: 'emerald-wv-cal-score-value', text: (profile.calibration_score).toFixed(1) });
		scoreRow.createSpan({ cls: 'emerald-wv-cal-score-desc', text: 'Higher = EMRALD knows you better' });

		if (typeof profile.last_calibrated_at === 'string') {
			section.createDiv({
				cls: 'emerald-wv-cal-last',
				text: `Last calibrated: ${this.formatRelativeTime(profile.last_calibrated_at)}`
			});
		}
	}

	// ── Answered Questions (ungrouped cards) ─────────────

	private renderAnsweredQuestions(container: Element, profile: Record<string, unknown>, driftLevel: number = 0) {
		// Collect all answered calibration/advanced answers
		const calibrationAnswers = (profile.calibration_answers as Record<string, unknown>) ?? {};
		const advancedAnswers = (profile.advanced_answers as Record<string, unknown>) ?? {};
		const allAnswers = { ...calibrationAnswers, ...advancedAnswers };

		const answeredKeys = Object.keys(allAnswers).filter(k => QUESTION_LABELS[k]);

		if (answeredKeys.length === 0) return;

		// Determine which keys to nudge based on D19 drift
		const showNudges = driftLevel >= 0.2;
		const highDrift = driftLevel >= 0.5;

		// Keys related to core traits — these are most likely to drift
		const traitRelatedKeys = new Set([
			'chronotype', 'work_pace_style', 'sleep_quality_baseline',
			'physical_fitness_baseline', 'focus_session_capacity', 'recovery_rate',
			'stimulation_need', 'stress_pattern_primary', 'overcommitment_tendency',
			'task_switching_preference', 'avoidance_pattern', 'natural_gravitation'
		]);

		const section = container.createDiv({ cls: 'emerald-wv-section' });

		const headerRow = section.createDiv({ cls: 'emerald-wv-section-header-row' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-section-icon' });
		setIcon(iconEl, 'list');
		headerRow.createEl('h3', { text: `Your Answers (${answeredKeys.length})` });

		// Shuffle-ish: present in a deliberately non-grouped order
		// (per spec: prevents reverse-engineering the assessment system)
		const shuffled = this.pseudoShuffleKeys(answeredKeys);

		const grid = section.createDiv({ cls: 'emerald-wv-answers-grid' });

		for (const key of shuffled) {
			const info = QUESTION_LABELS[key];
			const value = allAnswers[key];

			const shouldNudge = showNudges && (highDrift || traitRelatedKeys.has(key));
			const cardCls = shouldNudge
				? 'emerald-wv-answer-card emerald-wv-answer-card-nudge'
				: 'emerald-wv-answer-card';

			const card = grid.createDiv({ cls: cardCls });
			card.createDiv({ cls: 'emerald-wv-answer-question', text: info.label });

			const valueText = this.formatAnswerValue(value, info.format, key);
			card.createDiv({ cls: 'emerald-wv-answer-value', text: valueText });

			if (shouldNudge) {
				const nudge = card.createDiv({ cls: 'emerald-wv-answer-nudge' });
				const nudgeIcon = nudge.createSpan({ cls: 'emerald-wv-answer-nudge-icon' });
				setIcon(nudgeIcon, 'refresh-cw');
				nudge.createSpan({ text: 'Review suggested' });
			}
		}
	}

	/**
	 * Pseudo-shuffle: interleave keys from different categories to avoid grouping.
	 * Uses a simple alternation: take one from onboarding, one from advanced, repeat.
	 */
	private pseudoShuffleKeys(keys: string[]): string[] {
		const onboarding = keys.filter(k => !this.isAdvancedKey(k));
		const advanced = keys.filter(k => this.isAdvancedKey(k));

		const result: string[] = [];
		let i = 0, j = 0;
		while (i < onboarding.length || j < advanced.length) {
			if (i < onboarding.length) result.push(onboarding[i++]);
			if (j < advanced.length) result.push(advanced[j++]);
		}
		return result;
	}

	private isAdvancedKey(key: string): boolean {
		const advancedKeys = [
			'interest_consistency', 'achievement_drive', 'impulsiveness', 'structure_preference',
			'delegation_comfort', 'decision_style', 'core_motivation', 'stress_pattern_primary',
			'competition_response', 'stimulation_need', 'ambiguity_tolerance', 'enablement_tendency',
			'competence_satisfaction', 'relatedness_satisfaction', 'physical_fitness_baseline',
			'max_sustained_project_duration', 'focus_session_capacity', 'recovery_rate',
			'life_domains_count', 'overcommitment_tendency', 'task_switching_preference',
			'purpose_sensitivity', 'flow_activities', 'avoidance_pattern', 'natural_gravitation',
			'current_frustration', 'imported_mbti', 'imported_enneagram', 'imported_clifton_top5'
		];
		return advancedKeys.includes(key);
	}

	private formatAnswerValue(value: unknown, format: 'slider' | 'enum' | 'text', key?: string): string {
		if (value === null || value === undefined) return '—';

		if (format === 'slider') {
			if (typeof value !== 'number') return typeof value === 'string' ? value : '—';
			// Use explicit 5-point scale if defined for this question
			if (key && SLIDER_SCALES[key]) {
				const scale = SLIDER_SCALES[key];
				const idx = Math.max(0, Math.min(4, Math.round(value) - 1));
				return scale[idx];
			}
			return `${value}/5`;
		}

		if (format === 'text') {
			if (typeof value === 'string') return value;
			if (typeof value === 'number') return String(value);
			return '—';
		}

		// Enum: use display map first, fall back to readable transform
		const str = typeof value === 'string' ? value : (typeof value === 'number' ? String(value) : '—');
		if (ENUM_DISPLAY[str]) return ENUM_DISPLAY[str];
		return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}

	// ── Profile History Timeline ────────────────────────

	private renderHistory(container: Element, history: Array<Record<string, unknown>>) {
		const section = container.createDiv({ cls: 'emerald-wv-section' });

		const headerRow = section.createDiv({ cls: 'emerald-wv-section-header-row emerald-wv-collapsible-header' });
		const arrowEl = headerRow.createSpan({ cls: 'emerald-section-arrow', text: '▸' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-section-icon' });
		setIcon(iconEl, 'history');
		headerRow.createEl('h3', { text: 'Calibration history' });

		// Collapsible content (hidden by default)
		const content = section.createDiv({ cls: 'emerald-wv-collapsible-content' });
		content.addClass('emrald-hidden');

		headerRow.addClass('emrald-clickable');
		headerRow.addEventListener('click', () => {
			const isHidden = content.hasClass('emrald-hidden');
			if (isHidden) { content.removeClass('emrald-hidden'); } else { content.addClass('emrald-hidden'); }
			arrowEl.textContent = isHidden ? '▼' : '▸';
		});

		content.createEl('p', {
			cls: 'emerald-wv-history-intro',
			text: 'How your calibration scores have evolved over time.'
		});

		const table = content.createEl('table', { cls: 'emerald-wv-table' });
		const thead = table.createEl('thead');
		const thRow = thead.createEl('tr');

		// Column headers with explainer tooltips
		const columns = [
			{ label: 'Date', tip: '' },
			{ label: 'Score', tip: 'Overall calibration confidence score — higher means EMRALD knows you better' },
			{ label: 'Physical', tip: 'Physical capability — your physical work capacity' },
			{ label: 'Mental', tip: 'Mental capability — cognitive endurance and processing' },
			{ label: 'Phys. End.', tip: 'Physical endurance — how long you sustain physical effort' },
			{ label: 'Ment. End.', tip: 'Mental endurance — how long you sustain cognitive effort' }
		];

		for (const col of columns) {
			const th = thRow.createEl('th');
			th.createSpan({ text: col.label });
			if (col.tip) {
				const infoIcon = th.createSpan({ cls: 'emerald-wv-col-info', attr: { title: col.tip } });
				setIcon(infoIcon, 'info');
			}
		}

		const tbody = table.createEl('tbody');

		for (const entry of history.slice(0, 20)) {
			const row = tbody.createEl('tr');
			// Profile history entries store the full profile in a 'snapshot' JSONB column.
			// Fall back to top-level fields for backwards compatibility.
			const snap = (entry.snapshot ?? entry) as Record<string, unknown>;

			row.createEl('td', {
				text: typeof entry.recorded_at === 'string'
					? this.formatDateShort(entry.recorded_at)
					: typeof entry.created_at === 'string'
						? this.formatDateShort(entry.created_at)
						: '—'
			});
			row.createEl('td', {
				text: typeof snap.calibration_score === 'number'
					? (snap.calibration_score).toFixed(1)
					: '—'
			});
			row.createEl('td', {
				text: typeof snap.physical_capability === 'number'
					? (snap.physical_capability).toFixed(1)
					: '—'
			});
			row.createEl('td', {
				text: typeof snap.mental_capability === 'number'
					? (snap.mental_capability).toFixed(1)
					: '—'
			});
			row.createEl('td', {
				text: typeof snap.physical_novel_endurance === 'number'
					? (snap.physical_novel_endurance).toFixed(1)
					: '—'
			});
			row.createEl('td', {
				text: typeof snap.mental_abstract_endurance === 'number'
					? (snap.mental_abstract_endurance).toFixed(1)
					: '—'
			});
		}
	}

	// ── Actions ─────────────────────────────────────────

	private renderActions(container: Element, profile: Record<string, unknown>) {
		const section = container.createDiv({ cls: 'emerald-wv-section emerald-wv-profile-actions-section' });

		const headerRow = section.createDiv({ cls: 'emerald-wv-section-header-row' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-section-icon' });
		setIcon(iconEl, 'settings');
		headerRow.createEl('h3', { text: 'Actions' });

		const btnRow = section.createDiv({ cls: 'emerald-wv-profile-btn-row' });

		// Reassess
		const reassessBtn = btnRow.createEl('button', { cls: 'emerald-btn emerald-btn-secondary' });
		const reassessIcon = reassessBtn.createSpan({ cls: 'emerald-btn-icon' });
		setIcon(reassessIcon, 'refresh-cw');
		reassessBtn.createSpan({ text: 'Reassess profile' });
		reassessBtn.addEventListener('click', () => { void (async () => {
			try {
				const { ReassessmentModal } = await import('../../modals/reassessment');
				new ReassessmentModal(this.app, this.plugin).open();
			} catch { /* non-fatal */ }
		})(); });

		// Export data placeholder
		const exportBtn = btnRow.createEl('button', { cls: 'emerald-btn emerald-btn-subtle' });
		const exportIcon = exportBtn.createSpan({ cls: 'emerald-btn-icon' });
		setIcon(exportIcon, 'download');
		exportBtn.createSpan({ text: 'Export data (coming soon)' });
		exportBtn.setAttribute('disabled', 'true');
		exportBtn.addClass('emrald-dim');
		exportBtn.addClass('emrald-not-clickable');
	}

	// ── Data Center Cross-Link ─────────────────────────

	private renderDataCenterLink(container: Element) {
		const link = container.createDiv({ cls: 'emerald-wv-cross-link' });
		const anchor = link.createEl('a', {
			cls: 'emerald-wv-cross-link-text',
			text: 'See your calibration data (d19) in data center \u2192'
		});
		anchor.addEventListener('click', (e) => {
			e.preventDefault();
			void this.plugin.openWorkspaceView(VIEW_DATA_CENTER);
		});
	}

	// ── Helpers ──────────────────────────────────────────

	private formatRelativeTime(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(hours / 24);

		if (hours < 1) return 'just now';
		if (hours < 24) return `${hours}h ago`;
		if (days === 1) return 'yesterday';
		if (days < 7) return `${days} days ago`;
		if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
		return this.formatDate(iso);
	}

	private formatDateShort(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
}

class RecoveryInputModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private initialValue: string,
		private onSubmit: (value: string) => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: this.title });

		new Setting(contentEl)
			.setName('Activity')
			.addText(text => text
				.setValue(this.initialValue)
				.onChange(value => this.initialValue = value)
				.inputEl.focus());

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Save')
				.setCta()
				.onClick(() => {
					this.onSubmit(this.initialValue);
					this.close();
				}));
	}

	onClose() {
		this.contentEl.empty();
	}
}
