const fs = require('fs');
const { listPbs } = require('../shared/rksys');

function makePbsApi({ getSavePath, getActiveLicense }) {
  return {
    list: async () => {
      const p = getSavePath();
      if (!p || !fs.existsSync(p)) return [];
      const buf = fs.readFileSync(p);
      const license = getActiveLicense();
      const pbs = listPbs(buf, license);
      return pbs.map(pb => ({
        slot: pb.slot,
        trackId: pb.trackId,
        trackIndex: pb.trackIndex,
        trackName: pb.trackName,
        timeStr: pb.timeStr,
        timeMs: pb.timeMs,
        vehicle: pb.vehicle,
        character: pb.character,
        miiName: pb.miiName,
        lapTimes: pb.lapTimes.map(l => ({ timeMs: l.timeMs, timeStr: l.timeStr })),
      }));
    },
  };
}

module.exports = { makePbsApi };
