import { maakFeedNavigatie } from "./feedsluiten";

// Intro-animatie alleen bij de eerste keer laden; daarna niet opnieuw.
export const intro = { done: false };

export const geopendBinnen = { waarde: false };
// Feed geopend vanuit het overzicht: sluiten gaat via de geschiedenis.
export const feedNav = maakFeedNavigatie({ get location() { return window.location; }, get history() { return window.history; } });
