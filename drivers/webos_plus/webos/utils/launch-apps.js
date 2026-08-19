'use strict';

const REQUIRED_SYSTEM_APPS = Object.freeze({
  'com.webos.app.livetv': 'Live TV',
  'com.webos.app.lgchannels': 'LG Channels',
});

function validApp(app) {
  return app
    && typeof app.id === 'string'
    && app.id.trim()
    && typeof app.name === 'string'
    && app.name.trim();
}

function hasUserFacingName(app) {
  const name = app.name.trim();
  return !/^com\.(?:webos|lge)\./i.test(name)
    && !/\bexampleapp\b/i.test(name);
}

function buildLaunchableAppList(launchPoints, allApps) {
  if (!Array.isArray(launchPoints)) throw new TypeError('Launch points must be an array');
  if (!Array.isArray(allApps)) throw new TypeError('Application list must be an array');

  const choices = new Map();
  for (const app of launchPoints) {
    if (!validApp(app) || !hasUserFacingName(app)) continue;
    choices.set(app.id, {...app, name: app.name.trim()});
  }

  for (const [id, fallbackName] of Object.entries(REQUIRED_SYSTEM_APPS)) {
    const app = allApps.find(candidate => validApp(candidate) && candidate.id === id);
    if (!app) continue;
    choices.set(id, {
      ...app,
      name: hasUserFacingName(app) ? app.name.trim() : fallbackName,
    });
  }

  return [...choices.values()];
}

function filterLaunchableApps(apps, query = '') {
  const needle = `${query}`.trim().toLowerCase();
  return apps
    .filter(validApp)
    .filter(app => !needle || app.name.toLowerCase().includes(needle))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, {
      sensitivity: 'base',
    }));
}

module.exports = {
  REQUIRED_SYSTEM_APPS,
  buildLaunchableAppList,
  filterLaunchableApps,
};
