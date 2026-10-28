import { describe, expect, it } from 'vitest';
import { inputDevice, PAD_NAMES, padLabel, padStyleFromId } from '../../src/input/devices';

describe('gamepad styles', () => {
  it('recognises PlayStation pads by vendor id or name', () => {
    expect(padStyleFromId('054c-0ce6-Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('ps');
    expect(padStyleFromId('DualSense Wireless Controller')).toBe('ps');
    expect(padStyleFromId('Sony Interactive Entertainment DUALSHOCK 4')).toBe('ps');
  });

  it('treats everything else as Xbox', () => {
    expect(padStyleFromId('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(padStyleFromId('045e-02fd-Microsoft X-Box One pad')).toBe('xbox');
  });

  it('names every button in both styles', () => {
    expect(PAD_NAMES.ps).toHaveLength(PAD_NAMES.xbox.length);
    expect(padLabel(0, 'ps')).toBe('CROSS / A');
    expect(padLabel(0, 'xbox')).toBe('A / CROSS');
    expect(padLabel(2, 'ps')).toBe('SQUARE / X');
    expect(padLabel(3, 'ps')).toBe('TRIANGLE / Y');
    expect(padLabel(9, 'ps')).toBe('OPTIONS / START');
    expect(padLabel(12, 'ps')).toBe('UP'); // same in both: no "UP / UP"
    expect(padLabel(40)).toBe('B40'); // unknown buttons still get a name
  });

  it('follows whichever device was used last', () => {
    inputDevice.setPads(['054c-0ce6 Wireless Controller']);
    expect(inputDevice.pad).toBe('ps');
    inputDevice.notePad('Xbox 360 Controller');
    expect(inputDevice.current).toBe('xbox');
    inputDevice.note('keyboard');
    expect(inputDevice.usingPad).toBe(false);
    expect(inputDevice.pad).toBe('xbox'); // (still remembered for the hint bar)
    inputDevice.setPads([]);
    expect(inputDevice.padConnected).toBe(false);
  });
});
