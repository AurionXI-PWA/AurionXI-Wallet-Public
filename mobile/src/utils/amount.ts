export function formatDisplayAmount(raw: string, maximumFractionDigits = 6): string {
  const [whole = '0', fraction = ''] = raw.split('.');
  const visibleFraction = fraction.slice(0, maximumFractionDigits).replace(/0+$/, '');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return visibleFraction ? `${groupedWhole}.${visibleFraction}` : groupedWhole;
}
