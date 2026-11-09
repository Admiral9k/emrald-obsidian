// EMRALD About View: in-app field guide. Copy rewritten 2026-11-09 (S14) to the grunt-approved standard,
// gated by emrald-cmo (engine/briefs/cmo-gate-about-rewrite-result-2026-11-09.md). Web twin: src/routes/app/about/+page.svelte.

import { WorkspaceLeaf, setIcon } from 'obsidian';
import EmraldPlugin from '../../../main';
import { EmraldWorkspaceView, VIEW_ABOUT } from './base';
import { tierState } from '../../tier';

export class AboutView extends EmraldWorkspaceView {
	constructor(leaf: WorkspaceLeaf, plugin: EmraldPlugin) {
		super(leaf, plugin, 'About EMRALD', 'gem');
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
		this.renderHeader(container, 'About EMRALD', "A record of what your work costs", 'gem');

		// ── Hero ─────────────────────
		const hero = container.createDiv( { cls: 'emerald-wv-about-hero' });
		hero.createEl('p', { cls: 'emerald-wv-about-hero-tagline',
			text: "EMRALD keeps a record of how heavy your work felt and how long it really took." });
		hero.createEl('p', { cls: 'emerald-wv-about-hero-sub',
			text: "It shows you where your effort goes, so you can see your day before you plan the next one." });
		hero.createEl('p', { cls: 'emerald-wv-about-hero-mission',
			text: "Spend yourself wisely." });

		const specs = hero.createDiv( { cls: 'emerald-wv-about-specstrip' });
		const specItems = [
			{ icon: 'bar-chart-2', label: "20 metrics" },
			{ icon: 'zap', label: "4 effort levels" },
			{ icon: 'lightbulb', label: "5-question receipt" },
			{ icon: 'trending-up', label: "Forecast beside actual" },
			{ icon: 'alert-triangle', label: "Free burnout monitor" },
			{ icon: 'globe', label: "Plugin and web, one account" },
		];
		for (const s of specItems) {
			const chip = specs.createSpan( { cls: 'emerald-wv-about-speckchip' });
			setIcon(chip.createSpan( { cls: 'emerald-wv-about-speckchip-icon' }), s.icon);
			chip.createSpan( { cls: 'emerald-wv-about-speckchip-label', text: s.label });
		}

		// 1. What EMRALD is
		this.makeSection(container, 'what-it-is', 'gem', "What EMRALD is", el => {
			this.para(el as HTMLElement, "EMRALD is a record of how your own work days went. It runs as this Obsidian plugin and as a web app, and one account works on both.");
			el.createDiv( { cls: 'emerald-wv-about-thesis' }).createEl('blockquote', { text: "Every productivity app measures what you get done. EMRALD measures what it costs you." });
			{
				const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
				this.bullet(list, "\"Effort\" here means how heavy the work felt, in your own ratings.");
				this.bullet(list, "You time your work sessions.");
				this.bullet(list, "After each one, you rate how it felt.");
				this.bullet(list, "EMRALD turns those ratings and times into numbers about your effort, your energy, and your burnout risk.");
			}
			this.para(el as HTMLElement, "You get a record of where your time went and what it took out of you.");
		});

		// 2. What EMRALD does not do
		this.makeSection(container, 'what-it-isnt', 'x-circle', "What EMRALD does not do", el => {
			this.para(el as HTMLElement, "Some things people expect from a work app are missing here, on purpose.");
			{
				const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
				this.bullet(list, "EMRALD does not keep your to-do list.");
				this.bullet(list, "EMRALD does not run your calendar.");
				this.bullet(list, "EMRALD does not schedule your day.");
				this.bullet(list, "EMRALD does not grade your days.");
				this.bullet(list, "EMRALD does not read your notes or your work.");
			}
			this.para(el as HTMLElement, "Whether work got finished is one of the metrics. It sits next to the others and gets no special weight.");
		});

		// 3. What you do
		this.makeSection(container, 'what-you-bring', 'play-circle', "What you do", el => {
			this.para(el as HTMLElement, "Each step is small. You do them in this order.");
			{
				const list = el.createEl('ol', { cls: 'emerald-wv-about-numbered-list' });
				this.bullet(list, "Add a project and pick its effort level. An effort level is the share of your daily work time you set aside for that project.");
				this.bullet(list, "Press the play button, then pick a project. A session is one stretch of work.");
				this.bullet(list, "Stop the session when you are done.");
				this.bullet(list, "Fill in the receipt. It is five questions, about ten seconds, and you can skip it. A skip still records the session.");
				this.bullet(list, "Optional: fill in the daily check-in. It covers sleep, energy, and how you feel.");
				this.bullet(list, "At the end of the day, press Close Day to see a summary of the day.");
			}
			this.para(el as HTMLElement, "Sessions under 5 minutes skip the receipt and still count.");
		});

		// 4. What you get back
		this.makeSection(container, 'what-you-get', 'gift', "What you get back", el => {
			this.para(el as HTMLElement, "Your numbers come back to you in a few places.");
			{
				const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
				this.bullet(list, "Metrics: 20 measurements of your work, such as Completion Rate (PRO). Free has the first 8. PRO has all 20.");
				this.bullet(list, "Forecast (free): for a multi-day project, EMRALD suggests an effort level and shows the forecast next to what actually happened.");
				this.bullet(list, "Burnout monitor: free on every plan.");
				this.bullet(list, "Insight log: short notes sorted into observations, suggestions, warnings, celebrations, and discoveries.");
				this.bullet(list, "Digests: a weekly summary on free. PRO adds daily and monthly.");
			}
			this.para(el as HTMLElement, "Keep filling them in for a month and the full picture is yours.");
		});

		// 5. Why your day shows as shares
		this.makeSection(container, 'guardrails', 'shield', "Why your day shows as shares", el => {
			this.para(el as HTMLElement, "Every project takes a share of your day. Its effort level sets the size.");
			{
				const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
				this.bullet(list, "An E3 project takes 75 percent. An E2 project takes 50 percent.");
				this.bullet(list, "The Session timer shows your time against that share.");
				this.bullet(list, "You can have five active projects at a time, on free and PRO.");
			}
		});

		// 6. The six parts
		this.makeSection(container, 'core-systems', 'layers', "The six parts", el => {
			{
				const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
				this.bullet(list, "Effort levels: the four sizes of work (E1 to E4) you pick for each project. PRO adds your own custom levels.");
				this.bullet(list, "Metrics: your numbers, built from your sessions and receipts.");
				this.bullet(list, "Burnout monitor: one score from several of your metrics. You check it any time.");
				this.bullet(list, "Data Center: the screen where you read all your metrics.");
				this.bullet(list, "Insight log: where EMRALD writes up what stands out in your numbers.");
				this.bullet(list, "Daily check-in and receipt: two short forms you fill in. They feed the rest.");
			}
		});

		// 7. Who it's for
		this.makeSection(container, 'who-its-for', 'users', "Who it's for", el => {
			this.para(el as HTMLElement, "EMRALD is for people who lose track of time. People who end a day drained and cannot say why. People who tried a tracker once and felt graded by it.");
			this.para(el as HTMLElement, "EMRALD records how long things really took and how heavy they felt. Nothing in it grades you.");
			this.para(el as HTMLElement, "It also suits anyone who works on several projects at once and wants to see what each one takes. Students fit too: classes, projects, and exams all share the same week.");
		});

		// 8. How your record builds
		this.makeSection(container, 'how-it-learns', 'brain', "How your record builds", el => {
			this.para(el as HTMLElement, "Your record grows one receipt at a time.");
			{
				const list = el.createEl('ol', { cls: 'emerald-wv-about-numbered-list' });
				this.bullet(list, "You stop a session and fill in the receipt.");
				this.bullet(list, "Your receipts land in your numbers the day you start.");
				this.bullet(list, "For a multi-day project, you fill in a short effort profile. That is a few questions about the project. EMRALD compares your answers to your own past projects and suggests an effort level, with a confidence indicator.");
				this.bullet(list, "As receipts come in, EMRALD keeps the forecast next to the actual. You see how close your estimate ran.");
			}
			this.para(el as HTMLElement, "Some numbers need more receipts before they fill in.");
		});

		// 9. Learn more
		this.makeSection(container, 'learn-more', 'book-open', "Learn more", el => {
			const linkWrap = el.createDiv( { cls: 'emerald-wv-about-link-row' });
			this.link(linkWrap, 'https://getemrald.com/learn', 'The research and reasoning behind effort management: getemrald.com/learn');
			this.link(linkWrap, 'https://app.effortmastery.com/app/billing', 'Plans and billing: Manage your plan');

			// Privacy callout
			const privacyCallout = el.createDiv( { cls: 'emerald-wv-about-callout' });
			privacyCallout.createDiv( { cls: 'emerald-wv-about-callout-title', text: 'Privacy' });
			privacyCallout.createEl('p', { cls: 'emerald-wv-about-callout-body', text: "EMRALD sees your session data. That means timestamps, effort ratings, and project names. The plugin adds only frontmatter to your notes and never reads what you wrote. The plugin code is public." });
		});

		// Pro Teaser (free users only)
		if (tierState.isFree()) {
			const proSection = container.createDiv( { cls: 'emerald-wv-section emerald-wv-about-section emerald-wv-pro-teaser' });
			const proHeader = proSection.createDiv( { cls: 'emerald-wv-about-section-header' });
			const proIcon = proHeader.createSpan( { cls: 'emerald-wv-about-section-icon' });
			setIcon(proIcon, 'sparkles');
			proHeader.createEl('h3', { cls: 'emerald-wv-about-section-title', text: 'What PRO adds' });

			const proContent = proSection.createDiv( { cls: 'emerald-wv-about-section-content' });
			proContent.createEl('p', {
				cls: 'emerald-wv-about-p',
				text: 'PRO adds the rest of the metrics and the extra views.'
			});

			const featureGrid = proContent.createDiv( { cls: 'emerald-wv-pro-feature-grid' });
			const features = [
				{ icon: 'bar-chart-2', text: 'All 20 metrics' },
				{ icon: 'lightbulb', text: 'Extra insights' },
				{ icon: 'sliders-horizontal', text: 'Custom effort levels' },
				{ icon: 'calendar-range', text: 'Daily and monthly digests' },
				{ icon: 'pin', text: 'Pinned metrics in your sidebar' },
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
				text: 'Get PRO',
				href: 'https://app.effortmastery.com/app/billing'
			});
			cta.setAttribute('target', '_blank');
		}
	}
}
