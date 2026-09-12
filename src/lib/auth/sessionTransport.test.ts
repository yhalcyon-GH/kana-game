import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inMemorySessionTransport } from './sessionTransport';

describe('inMemorySessionTransport', () => {
  beforeEach(() => {
    inMemorySessionTransport.clear();
  });

  it('getToken() returns null when no token has been set', () => {
    expect(inMemorySessionTransport.getToken()).toBeNull();
  });

  it('setToken() then getToken() returns the value that was set', () => {
    inMemorySessionTransport.setToken('abc-123');
    expect(inMemorySessionTransport.getToken()).toBe('abc-123');
  });

  it('clear() removes a previously set token', () => {
    inMemorySessionTransport.setToken('abc-123');
    inMemorySessionTransport.clear();
    expect(inMemorySessionTransport.getToken()).toBeNull();
  });

  it('never touches localStorage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    inMemorySessionTransport.setToken('abc-123');
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('never touches sessionStorage', () => {
    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem');
    inMemorySessionTransport.setToken('abc-123');
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
