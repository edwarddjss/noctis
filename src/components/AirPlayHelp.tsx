export function AirPlayHelp({ allowed }: { allowed: boolean }) {
  return (
    <details className="card help">
      <summary>Watching on a TV (AirPlay)</summary>
      {allowed ? (
        <div className="small">
          <p>
            When your browser reports an available receiver, an <strong>AirPlay</strong> button appears in the player controls (on some non-Apple browsers it&apos;s
            labelled <strong>Send to TV</strong>). Once playing on the TV, this screen keeps the score and controls.
          </p>
          <p>Whether it works depends on:</p>
          <ul>
            <li>your browser — Safari on iPhone, iPad and Mac supports AirPlay for web video; other browsers may not;</li>
            <li>the stream format — native HLS can be sent; some fallback playback modes can&apos;t;</li>
            <li>the receiver — an Apple TV or AirPlay-compatible TV on the same network;</li>
            <li>the provider — some providers restrict playback on external screens.</li>
          </ul>
          <p>
            You can also use <strong>Screen Mirroring</strong> from Control Center. AirPlay or other casting support isn&apos;t guaranteed for every browser, device or
            stream.
          </p>
        </div>
      ) : (
        <p className="small">The provider of this stream doesn&apos;t allow playback on external screens.</p>
      )}
    </details>
  );
}
