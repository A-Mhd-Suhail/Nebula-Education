/* THE PENTAGON - settings for the My calendar pages */
window.HX_CONFIG = {
  API_BASE: '',         // your backend address, e.g. 'https://api.yourschool.com/v1'. Empty = not connected yet
  STREAM_URL: '',       // optional live-update address (Server-Sent Events), e.g. API_BASE + '/calendar/stream?token=...'
  POLL_MS: 30000,       // how often the pages check for new data (30 seconds)
  YEAR_START_MONTH: 6,  // academic year starts in June
  YEAR_END_MONTH: 4,    // and ends in April
  WEEKLY_OFF: [0]       // 0 = Sunday
};