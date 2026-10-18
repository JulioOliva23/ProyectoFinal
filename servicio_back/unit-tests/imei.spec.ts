import { isValidImei, luhnChecksum, normalizeImei } from '../src/domain/devices/imei';

describe('IMEI validation (RN-02)', () => {
  it.each(['490154203237518', '356938035643809', '352099001761481'])('accepts Luhn-valid IMEI %s', (imei) => {
    expect(isValidImei(imei)).toBe(true);
  });

  it('rejects an IMEI whose check digit is wrong', () => {
    expect(isValidImei('490154203237519')).toBe(false);
  });

  it.each(['49015420323751', '4901542032375180', '49015420323751A', '', ' 490154203237518'])(
    'rejects malformed input %p',
    (value) => {
      expect(isValidImei(value)).toBe(false);
    },
  );

  it('rejects all-zero-but-valid-length strings only when checksum fails', () => {
    expect(isValidImei('000000000000000')).toBe(true);
    expect(isValidImei('000000000000001')).toBe(false);
  });

  it('normalizes dashes and spaces before validation', () => {
    expect(isValidImei(normalizeImei('35-209900-176148-1'))).toBe(true);
    expect(isValidImei(normalizeImei('3520 9900 1761 481'))).toBe(true);
  });

  it('computes the Luhn checksum digit-by-digit from the right', () => {
    expect(luhnChecksum('79927398713')).toBe(0);
    expect(luhnChecksum('79927398710')).not.toBe(0);
  });
});
