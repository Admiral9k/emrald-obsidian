// EMRALD About View — In-app field guide, explainer, and trust-builder.
// Replaces the original minimal about page with a rich, marketing-forward
// onboarding explainer covering: what EMRALD is, what you bring,
// what you get, guardrails, core systems, who it’s for, and how it learns.

import { WorkspaceLeaf, setIcon } from 'obsidian';
import EmraldPlugin from '../../../main';
import { EmraldWorkspaceView, VIEW_ABOUT } from './base';
import { tierState } from '../../tier';

export class AboutView extends EmraldWorkspaceView {
	constructor(leaf: WorkspaceLeaf, plugin: EmraldPlugin) {
		super(leaf, plugin, 'About EMRALD');
	}

	getViewType(): string { return VIEW_ABOUT; }
	getIcon(): string { return 'gem'; }

	// ── Helpers ────────────────────────

	private makeSection(
		parent: Element,
		id: string,
		iconName: string,
		title: string,
		children: (el: Element) => void
	) {
		const section = parent.createDiv( { cls: 'emerald-wv-about-section' });
		const header = section.createDiv( { cls: 'emerald-wv-about-section-header' });
		const iconWrap = header.createSpan( { cls: 'emerald-wv-about-section-icon' });
		setIcon(iconWrap, iconName);
		const arrow = header.createSpan( { cls: 'emerald-wv-about-section-arrow', text: '\u25B8' });
		header.createEl('h3', { attr: { id }, cls: 'emerald-wv-about-section-title', text: title });
		const content = section.createDiv( { cls: 'emerald-wv-about-section-content' });
		content.addClass('emrald-hidden');
		header.addEventListener('click', () => {
			const visible = !content.hasClass('emrald-hidden');
			if (visible) { content.addClass('emrald-hidden'); } else { content.removeClass('emrald-hidden'); }
			arrow.textContent = visible ? '\u25B8' : '\u25BE';
		});
		children(content);
	}

	private para(el: HTMLElement, text: string) {
		el.createEl('p', { text, cls: 'emerald-wv-about-p' });
	}

	private bullet(el: HTMLElement, text: string) {
		el.createEl('li', { text, cls: 'emerald-wv-about-bullet' });
	}

	private link(el: HTMLElement, href: string, text: string) {
		return el.createEl('a', { href, text, cls: 'emerald-wv-about-link', attr: { target: '_blank', rel: 'noopener' } });
	}

	// ── Render ──────────────────────

	async onOpen() {
		await super.onOpen();
		const container = this.getContainer();
		this.renderHeader(container, 'About EMRALD', 'Effort Management Recursive AI Learning Driver', 'gem');

		// ── Hero ─────────────────────
		const hero = container.createDiv( { cls: 'emerald-wv-about-hero' });
		hero.createEl('p', { cls: 'emerald-wv-about-hero-tagline',
			text: 'EMRALD helps you manage the effort of your life, not just your tasks.' });
		hero.createEl('p', { cls: 'emerald-wv-about-hero-sub',
			text: 'It learns from your sessions, your energy, and your honest feedback to show you what your projects are really costing you.' });
		hero.createEl('p', { cls: 'emerald-wv-about-hero-mission',
			text: 'EMRALD exists to make the invisible cost of your work visible, enabling you to protect your energy, spot burnout before it hits, and make honest decisions about where your effort goes.' });

		const specs = hero.createDiv( { cls: 'emerald-wv-about-specstrip' });
		const specItems = [
			{ icon: 'bar-chart-2', label: '20 D-Metrics' },
			{ icon: 'zap', label: '4 E-Levels' },
			{ icon: 'alert-triangle', label: 'Burnout Monitoring' },
			{ icon: 'lightbulb', label: 'AI Insights' },
			{ icon: 'folder', label: 'Built for Obsidian' },
			{ icon: 'trending-up', label: 'Gets Smarter Over Time' },
		];
		for (const s of specItems) {
			const chip = specs.createSpan( { cls: 'emerald-wv-about-speckchip' });
			setIcon(chip.createSpan( { cls: 'emerald-wv-about-speckchip-icon' }), s.icon);
			chip.createSpan( { cls: 'emerald-wv-about-speckchip-label', text: s.label });
		}

		// 1. What EMRALD Is
		this.makeSection(container, 'what-it-is', 'gem', 'What EMRALD Is', el => {
			this.para(el as HTMLElement, 'EMRALD is an effort tracker that lives inside Obsidian. While other tools count tasks completed or hours logged, EMRALD asks a different question: what did that work actually cost you?');

			// Effort ≠ Energy callout
			const callout = el.createDiv( { cls: 'emerald-wv-about-callout' });
			callout.createDiv( { cls: 'emerald-wv-about-callout-title', text: "Effort isn\u2019t energy \u2014 it\u2019s what you spend your energy on." });
			callout.createEl('p', { cls: 'emerald-wv-about-callout-body', text: "Energy is your tank. Effort is how you draw from it \u2014 the conscious cost of choosing to push through something hard, and the subconscious cost of effort misalignment that quietly builds into mental fatigue. EMRALD tracks both: not just how tired you feel, but what made you tired, and whether it was worth it." });

			this.para(el as HTMLElement, 'It works by asking you to assign effort levels (E1–E4) to your projects, then watching how you actually spend your time. Over days and weeks it builds a picture of your patterns, flags burnout risk before you feel it, and shows you what your work is really taking from you.');
			const quoteWhatItIs = el.createDiv( { cls: 'emerald-wv-about-thesis' });
			quoteWhatItIs.createEl('blockquote', { text: "You don't burn out from too many tasks. You burn out from too much effort in the wrong places." });
		});

		// 2. What EMRALD Is Not
		this.makeSection(container, 'what-it-isnt', 'x-circle', 'What EMRALD Is Not', el => {
			this.para(el as HTMLElement, "EMRALD won't make you more productive in the traditional sense. It isn't built to help you do more, faster, or better than yesterday. Here's what it deliberately isn't:");
			const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
			this.bullet(list, 'A checklist or to-do tracker — It doesn\'t tell you what to do');
			this.bullet(list, 'A calendar or time-blocking app — It doesn\'t schedule your day');
			this.bullet(list, 'A deliverables manager — It doesn\'t track whether things got done');
			this.bullet(list, 'A hustle optimizer — It won\'t push you to do more with less');
			this.bullet(list, 'A replacement for your brain — It works with your existing projects in Obsidian');
			this.para(el as HTMLElement, "EMRALD is a mirror for your effort. It shows you where your energy is going, whether that's sustainable, and what's really driving the patterns you live with every day.");
		});

		// 3. What You Bring
		this.makeSection(container, 'what-you-bring', 'play-circle', 'What You Bring', el => {
			this.para(el as HTMLElement, "EMRALD is deliberately low-friction. There's no new app to learn, no complex setup, and no ongoing habit to build from scratch. Everything you need already exists: your projects live in Obsidian, and EMRALD just starts watching how you work.");
			this.para(el as HTMLElement, "Here's everything EMRALD asks of you:");
			const list = el.createEl('ol', { cls: 'emerald-wv-about-numbered-list' });
			const steps = [
				'Add your projects to EMRALD using the "+Add" button in the sidebar.',
				'Assign an E-level to each project, based on the percentage of your daily work day you think it deserves.',
				'Click Start Session when you begin working on a project.',
				'Click Stop Session when you\'re done.',
				'Complete the 15-second effort receipt at the end of each session. Just be honest about how hard it felt.',
				'Once a day, take 15 seconds for the Daily Check-in: how is your energy level today?',
				'If you finish your planned work before the day ends, click Close Day. It helps EMRALD calibrate faster.',
			];
			for (const s of steps) this.bullet(list, s);
			const quoteYouBring = el.createDiv( { cls: 'emerald-wv-about-thesis' });
			quoteYouBring.createEl('blockquote', { text: "Honest data in, honest insights out." });
		});

		// 4. What EMRALD Gives Back
		this.makeSection(container, 'what-you-get', 'gift', 'What EMRALD Gives Back', el => {
			this.para(el as HTMLElement, "The more you use EMRALD honestly, the more it gives back. Here's what you'll see accumulate over time:");
			const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
			this.bullet(list, 'D-Metrics (D1–D20): Twenty diagnostic measurements of your effort patterns, energy balance, and work rhythm');
			this.bullet(list, 'AI Insight Logs: Observations, suggestions, and discoveries about your patterns across 5 categories');
			this.bullet(list, "Burnout Monitoring: Early warnings when your effort distribution suggests you're heading toward exhaustion");
			this.bullet(list, 'Effort Digests: Weekly and monthly summaries of where your energy went');
			this.bullet(list, 'Completion Rate: Clarity on which projects you finish versus abandon');
			this.bullet(list, 'Calibration Over Time: EMRALD adjusts its model of you the more data it has, getting smarter and more accurate');
			this.bullet(list, "75+ data points feed into every metric: EMRALD processes your sessions, energy, and calibration data across 20 D-metrics and layered internal measurements to surface patterns you'd never catch on your own.");
			this.para(el as HTMLElement, "Early on, some views will be sparse. That's normal. The system needs weeks of real data to unlock its full value. This isn't a flaw, it's how EMRALD learns your specific rhythm.");
		});

		// 5. Why the Guardrails Exist
		this.makeSection(container, 'guardrails', 'shield', 'Why the Guardrails Exist', el => {
			this.para(el as HTMLElement, "If you've wondered why EMRALD limits how much E-level work you can assign in a day, or why it nudges you toward balance instead of pushing you to maximize — this is why.");
			this.para(el as HTMLElement, "The system is built on a simple truth: burnout doesn't come from too many tasks. It comes from too much effort in the wrong distribution, for too long, without recovery.");
			const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
			this.bullet(list, "Your day has a finite capacity, whatever hours you've set in your schedule. EMRALD won't let you pretend you have more.");
			this.bullet(list, 'E4 work is genuinely exhausting. You can only do so much of it before the quality of everything drops.');
			this.bullet(list, "Filling your day to 100% with demanding work is a fast path to burnout — EMRALD's allocation system is designed to prevent exactly that.");
			this.bullet(list, "Early data will look incomplete. Charts won't fill in nicely for the first couple weeks. This is normal — the system is learning your baseline before it can tell you meaningful things about deviations.");
			const quoteGuardrails = el.createDiv( { cls: 'emerald-wv-about-thesis' });
			quoteGuardrails.createEl('blockquote', { text: "The promise of EMRALD is not instant insight. It's real insight, earned through consistent, honest use over time." });
		});

		// 6. Core Systems
		this.makeSection(container, 'core-systems', 'layers', 'Core Systems', el => {
			this.para(el as HTMLElement, "Six things make EMRALD work. Here's what each one does:");
			const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
			this.bullet(list, 'E-Levels (E1–E4): Four effort tiers from light to maximum. You assign them to projects to set expectations for how much energy a session will cost.');
			this.bullet(list, 'D-Metrics (D1–D20): Twenty computed measurements of your effort patterns. D1–D8 are available to all users; D9–D20 unlock with Pro.');
			this.bullet(list, "Burnout Monitor: Tracks your effort distribution across E-levels and warns you when patterns suggest you're overextended.");
			this.bullet(list, 'Data Center: The visual home of all your D-metrics, with charts and context for each measurement.');
			this.bullet(list, "Insight Log: AI-generated observations, suggestions, and discoveries about your effort patterns.");
			this.bullet(list, 'Daily Check-in & Effort Receipt: The two feedback inputs that power the entire system.');
			this.para(el as HTMLElement, "Effort management is a growing field: new research surfaces regularly on how people experience, misallocate, and recover from the effort they spend. EMRALD tracks that research closely, so the system is evolving alongside the science. If you've tried productivity tools that felt right at first but eventually stopped helping, this is part of why: they were built on static assumptions about how you work. EMRALD isn't.");
		});

		// 7. Who EMRALD Helps
		this.makeSection(container, 'who-its-for', 'users', 'Who EMRALD Helps', el => {
			this.para(el as HTMLElement, "EMRALD was designed for people who refuse to simplify their lives to fit a productivity system. If any of these describe you, EMRALD was probably built for you:");
			const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
			this.bullet(list, 'Polymath Operators — people who run multiple creative or professional projects simultaneously and need to understand how their energy divides across them');
			this.bullet(list, "Neurodivergent Individuals — people who experience energy and focus differently and need a system that adapts to them, not the other way around");
			this.bullet(list, 'Students — people managing coursework, side projects, and exam prep across the same finite week');
			this.bullet(list, "Creators — writers, artists, builders who work on long-horizon projects that don't fit into a task-tracker");
			this.bullet(list, "Knowledge Workers — people whose output isn't easily measured by hours logged or tasks checked off");
			this.bullet(list, 'Anyone Juggling Multiple Identities — parent, professional, hobbyist, student — all in the same person, all with legitimate energy claims on your day');

			// Whole-life callout
			const wholeLife = el.createDiv( { cls: 'emerald-wv-about-callout' });
			wholeLife.createDiv( { cls: 'emerald-wv-about-callout-title', text: 'EMRALD works across your whole life' });
			wholeLife.createEl('p', { cls: 'emerald-wv-about-callout-body', text: "Your novel. Learning piano. A home renovation. Family commitments. Side projects. EMRALD doesn\u2019t care if it\u2019s a work task or a personal one \u2014 if it takes focused time and costs you something, it belongs here." });

			this.para(el as HTMLElement, "If you've tried every productivity system and found that none of them actually helped you understand where your energy goes, you're probably the person EMRALD was made for.");
		});

		// 8. How EMRALD Learns
		this.makeSection(container, 'how-it-learns', 'brain', 'How EMRALD Learns', el => {
			this.para(el as HTMLElement, "EMRALD is a recursive feedback system. It's only as smart as the signal you give it.");
			this.para(el as HTMLElement, "Every time you start a session, submit an effort receipt, or complete a daily check-in, you're teaching EMRALD what your work actually costs. The more honest and consistent you are, the more accurate its model of you becomes.");
			this.para(el as HTMLElement, "The first few weeks will feel light. Charts won't show much. Insights will be sparse. This isn't the system failing — it's the system learning. EMRALD needs a baseline before it can tell you meaningful things about deviations from it.");
			this.para(el as HTMLElement, 'Around the 2–3 week mark, you\'ll start seeing real patterns emerge. Around week 4–6, the insights become genuinely personalized. And the longer you use it, the more it adapts to your specific rhythm, strengths, and vulnerability points.');
			const quoteLearns = el.createDiv( { cls: 'emerald-wv-about-thesis' });
			quoteLearns.createEl('blockquote', { text: "EMRALD isn't going to dazzle you on day one. But if you stick with it, it will show you things about yourself that no other system can." });
		});

		// 9. Learn More
		this.makeSection(container, 'learn-more', 'book-open', 'Learn More', el => {
			this.para(el as HTMLElement, "This page is the field guide. The full story of effort management — the research behind it, the sources, the methodology, and the reasoning — lives online.");
			const linkWrap = el.createDiv( { cls: 'emerald-wv-about-link-row' });
			this.link(linkWrap, 'https://getemrald.com/learn', 'getemrald.com/learn — deeper reading on effort management and the research behind it');
			this.link(linkWrap, 'https://app.effortmastery.com', 'app.effortmastery.com — manage your EMRALD account');

			// Privacy callout
			const privacyCallout = el.createDiv( { cls: 'emerald-wv-about-callout' });
			privacyCallout.createDiv( { cls: 'emerald-wv-about-callout-title', text: 'Your notes stay yours.' });
			privacyCallout.createEl('p', { cls: 'emerald-wv-about-callout-body', text: "EMRALD syncs effort data only: session timestamps, effort ratings, and project names. Your note content never leaves your vault. The plugin has no mechanism to read, upload, or index your notes \u2014 it couldn\u2019t access them even if it tried." });
		});

		// Pro Teaser (free users only)
		if (tierState.isFree()) {
			const proSection = container.createDiv( { cls: 'emerald-wv-section emerald-wv-about-section emerald-wv-pro-teaser' });
			const proHeader = proSection.createDiv( { cls: 'emerald-wv-about-section-header' });
			const proIcon = proHeader.createSpan( { cls: 'emerald-wv-about-section-icon' });
			setIcon(proIcon, 'sparkles');
			proHeader.createEl('h3', { cls: 'emerald-wv-about-section-title', text: 'Want the full picture?' });

			const proContent = proSection.createDiv( { cls: 'emerald-wv-about-section-content' });
			proContent.createEl('p', {
				cls: 'emerald-wv-about-p',
				text: 'EMRALD PRO unlocks the full intelligence layer — 11 additional metrics, all 5 insight categories, weekly and monthly digests, AI suggestions, and more.'
			});

			const featureGrid = proContent.createDiv( { cls: 'emerald-wv-pro-feature-grid' });
			const features = [
				{ icon: 'lightbulb', text: 'AI-powered insight logs across 5 distinct categories' },
				{ icon: 'trending-up', text: 'Supercharged data center with 11 additional metrics (D9–D20)' },
				{ icon: 'calendar-range', text: 'Weekly + monthly digests' },
				{ icon: 'target', text: 'Personalized AI suggestions' },
				{ icon: 'pin', text: 'Pinned sidebar sparklines' },
				{ icon: 'zap', text: '1-minute sync times (vs 5-minute in Basic)' },
			];
			for (const feat of features) {
				const item = featureGrid.createDiv( { cls: 'emerald-wv-pro-feature-cell' });
				const iconEl = item.createSpan( { cls: 'emerald-wv-pro-feature-icon' });
				setIcon(iconEl, feat.icon);
				item.createSpan( { cls: 'emerald-wv-pro-feature-text', text: feat.text });
			}

			const ctaRow = proSection.createDiv( { cls: 'emerald-wv-pro-cta-row' });
			const cta = ctaRow.createEl('a', {
				cls: 'emerald-btn emerald-btn-upgrade',
				text: 'Upgrade to PRO',
				href: 'https://app.effortmastery.com/app/billing'
			});
			cta.setAttribute('target', '_blank');
		}
	}
}
