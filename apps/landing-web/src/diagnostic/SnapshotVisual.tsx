import type { SnapshotVisualId } from './types';

interface SnapshotVisualProps {
  visual: SnapshotVisualId;
}

function LineweaverVisual() {
  return (
    <svg
      className="snapshot-visual__svg"
      viewBox="0 0 520 300"
      role="img"
      aria-label="Lineweaver–Burk plot. The inhibitor line has a higher y-intercept, and both lines have nearly the same x-intercept."
    >
      <path className="snapshot-visual__axis" d="M52 240H478M160 264V26" />
      <path className="snapshot-visual__tick" d="M100 234v12M154 210h12" />
      <text className="snapshot-visual__label" x="432" y="276">
        1/[S]
      </text>
      <text className="snapshot-visual__label" x="174" y="38">
        1/v
      </text>
      <path
        className="snapshot-visual__series snapshot-visual__series--control"
        d="M100 240 452 74"
      />
      <path
        className="snapshot-visual__series snapshot-visual__series--accent"
        d="M100 240 382 28"
      />
      <g className="snapshot-visual__legend">
        <circle cx="344" cy="106" r="5" />
        <text x="356" y="111">
          No inhibitor
        </text>
        <circle className="snapshot-visual__legend-accent" cx="344" cy="63" r="5" />
        <text x="356" y="68">
          + Inhibitor
        </text>
      </g>
    </svg>
  );
}

function ReactionCoordinateVisual() {
  return (
    <svg
      className="snapshot-visual__svg"
      viewBox="0 0 520 300"
      role="img"
      aria-label="Two-step reaction-coordinate diagram. Reactants are at 20 kilojoules per mole, the first transition state at 60, an intermediate at 10, the second transition state at 75, and products at 5."
    >
      <path className="snapshot-visual__axis" d="M62 250H478M62 250V30" />
      <text className="snapshot-visual__label" x="390" y="280">
        Reaction coordinate
      </text>
      <text className="snapshot-visual__label" x="18" y="40">
        Energy
      </text>
      <path
        className="snapshot-visual__guide"
        d="M62 196H150M62 105H218M62 218H300M62 62H370M62 230H466"
      />
      <text className="snapshot-visual__minor-label" x="74" y="190">
        20
      </text>
      <text className="snapshot-visual__minor-label" x="74" y="99">
        60
      </text>
      <text className="snapshot-visual__minor-label" x="74" y="212">
        10
      </text>
      <text className="snapshot-visual__minor-label" x="74" y="56">
        75
      </text>
      <text className="snapshot-visual__minor-label" x="74" y="224">
        5
      </text>
      <path
        className="snapshot-visual__energy"
        d="M112 196H148C178 196 184 105 218 105c30 0 37 113 78 113 34 0 36-156 74-156 34 0 39 168 78 168h18"
      />
      <circle className="snapshot-visual__point" cx="218" cy="105" r="6" />
      <circle className="snapshot-visual__point" cx="370" cy="62" r="6" />
      <text className="snapshot-visual__annotation" x="108" y="185">
        Reactants
      </text>
      <text className="snapshot-visual__annotation" x="255" y="244">
        Intermediate
      </text>
      <text className="snapshot-visual__annotation" x="416" y="218">
        Products
      </text>
      <text className="snapshot-visual__units" x="74" y="252">
        kJ/mol
      </text>
    </svg>
  );
}

function WesternBlotVisual() {
  return (
    <svg
      className="snapshot-visual__svg"
      viewBox="0 0 520 300"
      role="img"
      aria-label="Western blot with unstimulated, growth-factor, and growth-factor plus inhibitor K lanes. Total ERK and the loading control are similar in all lanes. Phosphorylated ERK is high only with growth factor alone."
    >
      <rect className="snapshot-visual__blot" x="122" y="45" width="354" height="205" rx="8" />
      <text className="snapshot-visual__minor-label" x="174" y="276">
        Control
      </text>
      <text className="snapshot-visual__minor-label" x="274" y="276">
        GF
      </text>
      <text className="snapshot-visual__minor-label" x="363" y="276">
        GF + K
      </text>
      <text className="snapshot-visual__minor-label" x="28" y="98">
        Total ERK
      </text>
      <text className="snapshot-visual__minor-label" x="28" y="166">
        Phospho-ERK
      </text>
      <text className="snapshot-visual__minor-label" x="28" y="230">
        Loading
      </text>
      <rect className="snapshot-visual__band" x="158" y="83" width="72" height="13" rx="5" />
      <rect className="snapshot-visual__band" x="258" y="83" width="72" height="13" rx="5" />
      <rect className="snapshot-visual__band" x="358" y="83" width="72" height="13" rx="5" />
      <rect
        className="snapshot-visual__band snapshot-visual__band--faint"
        x="158"
        y="151"
        width="72"
        height="12"
        rx="5"
      />
      <rect className="snapshot-visual__band" x="258" y="149" width="72" height="16" rx="5" />
      <rect
        className="snapshot-visual__band snapshot-visual__band--faint"
        x="358"
        y="151"
        width="72"
        height="12"
        rx="5"
      />
      <rect className="snapshot-visual__band" x="158" y="215" width="72" height="13" rx="5" />
      <rect className="snapshot-visual__band" x="258" y="215" width="72" height="13" rx="5" />
      <rect className="snapshot-visual__band" x="358" y="215" width="72" height="13" rx="5" />
    </svg>
  );
}

function DoseResponseVisual() {
  return (
    <svg
      className="snapshot-visual__svg"
      viewBox="0 0 520 300"
      role="img"
      aria-label="Dose-response graph. Antagonist X shifts the curve right while preserving the control maximum. Antagonist Y lowers the maximum response."
    >
      <path className="snapshot-visual__axis" d="M64 240H478M64 240V28" />
      <path className="snapshot-visual__guide" d="M64 70H468" />
      <text className="snapshot-visual__label" x="326" y="278">
        log[Agonist]
      </text>
      <text className="snapshot-visual__label" x="12" y="38">
        Response
      </text>
      <text className="snapshot-visual__minor-label" x="70" y="64">
        Maximum
      </text>
      <path
        className="snapshot-visual__series snapshot-visual__series--control"
        d="M82 229C145 228 155 220 180 183c27-41 48-100 98-109 35-6 80-4 178-4"
      />
      <path
        className="snapshot-visual__series snapshot-visual__series--accent"
        d="M82 229C210 228 229 219 256 181c31-44 49-99 96-107 30-5 57-4 104-4"
      />
      <path
        className="snapshot-visual__series snapshot-visual__series--secondary"
        d="M82 229C168 228 184 219 210 186c29-36 46-62 88-66 42-4 92-3 158-3"
      />
      <g className="snapshot-visual__legend">
        <circle cx="314" cy="130" r="5" />
        <text x="326" y="135">
          Control
        </text>
        <circle className="snapshot-visual__legend-accent" cx="314" cy="156" r="5" />
        <text x="326" y="161">
          + Antagonist X
        </text>
        <circle className="snapshot-visual__legend-secondary" cx="314" cy="182" r="5" />
        <text x="326" y="187">
          + Antagonist Y
        </text>
      </g>
    </svg>
  );
}

function InitialRatesVisual() {
  return (
    <div className="snapshot-table-wrap">
      <table className="snapshot-data-table snapshot-data-table--rates">
        <caption>Initial-rate measurements for three trials</caption>
        <thead>
          <tr>
            <th scope="col">Trial</th>
            <th scope="col">[A] (M)</th>
            <th scope="col">[B] (M)</th>
            <th scope="col">Initial rate (M/s)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">1</th>
            <td>0.10</td>
            <td>0.10</td>
            <td>2.0 × 10⁻⁴</td>
          </tr>
          <tr>
            <th scope="row">2</th>
            <td>0.20</td>
            <td>0.10</td>
            <td>4.0 × 10⁻⁴</td>
          </tr>
          <tr>
            <th scope="row">3</th>
            <td>0.20</td>
            <td>0.20</td>
            <td>1.6 × 10⁻³</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PulseChaseVisual() {
  return (
    <div className="snapshot-table-wrap">
      <table className="snapshot-data-table">
        <caption>Location of the labeled protein during the pulse-chase</caption>
        <thead>
          <tr>
            <th scope="col">Condition</th>
            <th scope="col">Early</th>
            <th scope="col">Middle</th>
            <th scope="col">Late</th>
            <th scope="col">Total label</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Control</th>
            <td>Rough ER</td>
            <td>Golgi</td>
            <td>Medium</td>
            <td>Nearly constant</td>
          </tr>
          <tr>
            <th scope="row">+ Compound Z</th>
            <td>Rough ER</td>
            <td>Rough ER</td>
            <td>Rough ER</td>
            <td>Nearly constant</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function SnapshotVisual({ visual }: SnapshotVisualProps) {
  return (
    <figure className="snapshot-visual">
      {visual === 'lineweaver' ? <LineweaverVisual /> : null}
      {visual === 'reaction-coordinate' ? <ReactionCoordinateVisual /> : null}
      {visual === 'western-blot' ? <WesternBlotVisual /> : null}
      {visual === 'dose-response' ? <DoseResponseVisual /> : null}
      {visual === 'initial-rates' ? <InitialRatesVisual /> : null}
      {visual === 'pulse-chase' ? <PulseChaseVisual /> : null}
    </figure>
  );
}
