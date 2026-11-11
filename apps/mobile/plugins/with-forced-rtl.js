const { withMainApplication } = require('@expo/config-plugins');

const IMPORT_LINE = 'import com.facebook.react.modules.i18nmanager.I18nUtil';
const MARKER = 'I18nUtil.getInstance().forceRTL(';
const SNIPPET = [
  '    // Persist Arabic RTL before the first React surface is created (added by with-forced-rtl).',
  '    I18nUtil.getInstance().allowRTL(applicationContext, true)',
  '    I18nUtil.getInstance().forceRTL(applicationContext, true)',
].join('\n');

/**
 * Pure transform so it can be unit-tested: returns the patched Kotlin source.
 * Idempotent — a source that already forces RTL is returned unchanged.
 */
function applyForcedRtl(contents) {
  if (contents.includes(MARKER)) return contents;

  let next = contents;
  if (!next.includes(IMPORT_LINE)) {
    next = next.replace(/(import android\.app\.Application\s*\n)/, `$1${IMPORT_LINE}\n`);
  }
  if (!/super\.onCreate\(\)/.test(next)) {
    throw new Error('with-forced-rtl: MainApplication.onCreate() not found; add I18nUtil.forceRTL manually.');
  }
  return next.replace(/(super\.onCreate\(\)\s*\n)/, `$1${SNIPPET}\n`);
}

function withForcedRtl(config) {
  return withMainApplication(config, (modConfig) => {
    if (modConfig.modResults.language !== 'kt') {
      throw new Error('with-forced-rtl: only Kotlin MainApplication is supported.');
    }
    modConfig.modResults.contents = applyForcedRtl(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = withForcedRtl;
module.exports.applyForcedRtl = applyForcedRtl;
