const Sequencer = require('@jest/test-sequencer').default;

class IntegrationFirstSequencer extends Sequencer {
  sort(tests) {
    return [...tests].sort((a, b) => {
      const aIntegration = a.path.includes(`${require('path').sep}integration${require('path').sep}`) ? 0 : 1;
      const bIntegration = b.path.includes(`${require('path').sep}integration${require('path').sep}`) ? 0 : 1;
      if (aIntegration !== bIntegration) return aIntegration - bIntegration;
      return a.path.localeCompare(b.path);
    });
  }
}

module.exports = IntegrationFirstSequencer;
