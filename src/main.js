// Entry point.
import { getLocalTimeZone } from './lib/timezones.js';

const target = document.querySelector('[data-testid="local-zone"]');
if (target) target.textContent = getLocalTimeZone();
