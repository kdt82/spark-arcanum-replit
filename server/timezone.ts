/**
 * Timezone configuration for Spark Arcanum
 * Sets the server timezone to Sydney, Australia (UTC+10)
 */

// Set timezone to Sydney, Australia (UTC+10)
process.env.TZ = 'Australia/Sydney';

export function setupTimezone(): void {
  // Force timezone setting
  process.env.TZ = 'Australia/Sydney';
  
  // Log timezone information
  console.log(`🕐 Timezone set to: ${process.env.TZ}`);
  console.log(`🕐 Current Sydney time: ${new Date().toLocaleString('en-AU', { 
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })}`);
}

export function getSydneyTime(): Date {
  return new Date(new Date().toLocaleString("en-US", {timeZone: "Australia/Sydney"}));
}

export function formatSydneyDate(date: Date = new Date()): string {
  return date.toLocaleString('en-AU', { 
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}