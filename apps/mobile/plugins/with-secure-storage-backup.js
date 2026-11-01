const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const FULL_BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <!-- Session keys, encrypted account data and local files must never migrate to another device. -->
    <exclude domain="database" path="marketplat-private-v2.db" />
    <exclude domain="database" path="marketplat-private-v2.db-wal" />
    <exclude domain="database" path="marketplat-private-v2.db-shm" />
    <exclude domain="database" path="marketplat-public-cache.db" />
    <exclude domain="database" path="marketplat-public-cache.db-wal" />
    <exclude domain="database" path="marketplat-public-cache.db-shm" />
    <exclude domain="sharedpref" path="SecureStore" />
    <exclude domain="sharedpref" path="marketplat.mobile.session.v1" />
    <exclude domain="file" path="." />
</full-backup-content>
`;

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="database" path="marketplat-private-v2.db" />
        <exclude domain="database" path="marketplat-private-v2.db-wal" />
        <exclude domain="database" path="marketplat-private-v2.db-shm" />
        <exclude domain="database" path="marketplat-public-cache.db" />
        <exclude domain="database" path="marketplat-public-cache.db-wal" />
        <exclude domain="database" path="marketplat-public-cache.db-shm" />
        <exclude domain="sharedpref" path="SecureStore" />
        <exclude domain="sharedpref" path="marketplat.mobile.session.v1" />
        <exclude domain="file" path="." />
    </cloud-backup>
    <device-transfer>
        <exclude domain="database" path="marketplat-private-v2.db" />
        <exclude domain="database" path="marketplat-private-v2.db-wal" />
        <exclude domain="database" path="marketplat-private-v2.db-shm" />
        <exclude domain="database" path="marketplat-public-cache.db" />
        <exclude domain="database" path="marketplat-public-cache.db-wal" />
        <exclude domain="database" path="marketplat-public-cache.db-shm" />
        <exclude domain="sharedpref" path="SecureStore" />
        <exclude domain="sharedpref" path="marketplat.mobile.session.v1" />
        <exclude domain="file" path="." />
    </device-transfer>
</data-extraction-rules>
`;

function withSecureStorageBackup(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) throw new Error('with-secure-storage-backup: Android application manifest entry is missing.');
    application.$ = application.$ || {};
    application.$['android:allowBackup'] = 'false';
    application.$['android:fullBackupContent'] = '@xml/secure_store_backup_rules';
    application.$['android:dataExtractionRules'] = '@xml/secure_store_data_extraction_rules';
    application.$['android:supportsRtl'] = 'true';
    return modConfig;
  });

  return withDangerousMod(config, ['android', async (modConfig) => {
    const xmlDirectory = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(xmlDirectory, { recursive: true });
    fs.writeFileSync(path.join(xmlDirectory, 'secure_store_backup_rules.xml'), FULL_BACKUP_RULES, 'utf8');
    fs.writeFileSync(path.join(xmlDirectory, 'secure_store_data_extraction_rules.xml'), DATA_EXTRACTION_RULES, 'utf8');
    return modConfig;
  }]);
}

module.exports = withSecureStorageBackup;
