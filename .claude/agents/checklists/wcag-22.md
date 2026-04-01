# WCAG 2.2 Accessibility Checklist (AA Level)

## Perceivable

### Text Alternatives (1.1)

- [ ] All non-text content (images, icons, charts) has meaningful alt text or is marked decorative
- [ ] Complex images (infographics, diagrams) have extended descriptions
- [ ] Form inputs have associated labels via `<label>`, `aria-label`, or `aria-labelledby`
- [ ] CAPTCHAs provide alternative access methods (audio, logic-based)

### Time-Based Media (1.2)

- [ ] Pre-recorded video has captions; live video has real-time captions
- [ ] Pre-recorded audio-only content has a text transcript
- [ ] Pre-recorded video has audio descriptions for visual-only information

### Adaptable (1.3)

- [ ] Content structure is conveyed through semantic HTML (headings, lists, landmarks, tables)
- [ ] Reading order is logical when CSS is disabled
- [ ] Instructions do not rely solely on shape, size, color, or location ("click the red button")
- [ ] Content adapts to portrait and landscape orientations without loss of information
- [ ] Input purpose is identified for autofill-eligible fields using `autocomplete` attributes

### Distinguishable (1.4)

- [ ] Text color contrast ratio meets 4.5:1 (normal text) or 3:1 (large text) against background
- [ ] Non-text UI components and graphical objects have 3:1 contrast against adjacent colors
- [ ] Text can be resized up to 200% without loss of content or functionality
- [ ] Content reflows at 320px viewport width without horizontal scrolling
- [ ] Text spacing can be overridden (line height 1.5x, paragraph spacing 2x, letter/word spacing adjustable) without breaking layout
- [ ] Color is not the only visual means of conveying information (errors, status, categories)

## Operable

### Keyboard Accessible (2.1)

- [ ] All functionality is operable via keyboard alone
- [ ] No keyboard traps exist -- focus can always be moved away from any component
- [ ] Custom widgets implement expected keyboard patterns (arrow keys, Escape, Enter)

### Enough Time (2.2)

- [ ] Session timeouts can be turned off, adjusted, or extended with a warning
- [ ] Auto-updating content can be paused, stopped, or hidden
- [ ] No time limits are imposed unless essential to the activity

### Seizures and Physical Reactions (2.3)

- [ ] No content flashes more than 3 times per second
- [ ] Motion animations can be disabled via `prefers-reduced-motion` media query

### Navigable (2.4)

- [ ] A skip-to-main-content link is the first focusable element on each page
- [ ] Page titles are descriptive and unique
- [ ] Focus order follows a logical reading sequence
- [ ] Link text is descriptive out of context -- no raw "click here" or "read more" without context
- [ ] Multiple navigation mechanisms are available (menu, search, sitemap)
- [ ] Visible focus indicators have sufficient contrast and are never suppressed

### Input Modalities (2.5)

- [ ] Multi-point or path-based gestures have single-pointer alternatives
- [ ] Pointer actions can be cancelled (up-event or undo) to prevent accidental activation
- [ ] Dragging operations have non-dragging alternatives
- [ ] Target touch/click areas are at least 24x24 CSS pixels

## Understandable

### Readable (3.1)

- [ ] Page language is declared via the `lang` attribute on `<html>`
- [ ] Language changes within the page are marked with `lang` attributes on the relevant elements

### Predictable (3.2)

- [ ] Receiving focus does not trigger a change of context (navigation, popup)
- [ ] Changing a form input value does not automatically submit or navigate without warning
- [ ] Navigation and identification patterns are consistent across pages

### Input Assistance (3.3)

- [ ] Input errors are identified and described in text (not just color or icon)
- [ ] Form fields have visible labels and instructions before the user interacts
- [ ] Error suggestions offer corrective guidance when the system can detect the expected format
- [ ] Submissions that cause legal or financial commitments are reversible, verified, or confirmed
- [ ] Redundant entry is minimized -- information entered previously is auto-populated or selectable

## Robust

### Compatible (4.1)

- [ ] HTML validates without significant parsing errors
- [ ] Custom components use appropriate ARIA roles, states, and properties
- [ ] ARIA attributes are updated dynamically to reflect current widget state
- [ ] Status messages are announced to assistive technology via `role="status"` or `aria-live`
