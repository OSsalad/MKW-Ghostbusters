const { Notification } = require('electron');

function offerToast({ senderName, count, tracksText, onAccept, onReject }) {
  const subtitle = tracksText
    ? `${count} ghost${count > 1 ? 's' : ''}: ${tracksText}`
    : `${count} ghost${count > 1 ? 's' : ''}`;
  const n = new Notification({
    title: `Ghost incoming from ${senderName}`,
    body: subtitle,
    actions: [
      { type: 'button', text: 'Accept' },
      { type: 'button', text: 'Reject' },
    ],
    closeButtonText: 'Reject',
  });
  let decided = false;
  const accept = () => { if (!decided) { decided = true; onAccept(); } };
  const reject = () => { if (!decided) { decided = true; onReject(); } };
  n.on('action', (_e, idx) => { if (idx === 0) accept(); else reject(); });
  // On Windows, action buttons aren't always rendered. Click the toast body
  // to accept; if the user dismisses without clicking, we treat it as no-op
  // and rely on the in-window incoming-offers list as the fallback.
  n.on('click', accept);
  n.show();
  return n;
}

function infoToast(title, body) {
  new Notification({ title, body }).show();
}

module.exports = { offerToast, infoToast };
