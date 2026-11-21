import { describe, expect, it } from 'vitest';
import {
  resolveMediaStorageMetadata,
  sanitizeFileName,
} from './messaging.constants.js';

describe('messaging.constants helpers', () => {
  describe('resolveMediaStorageMetadata', () => {
    it('maps supported MIME types case-insensitively and rejects unsupported ones', () => {
      expect(resolveMediaStorageMetadata('image/jpeg')).toEqual({
        format: 'jpg',
        resourceType: 'image',
      });
      expect(resolveMediaStorageMetadata('IMAGE/PNG')).toEqual({
        format: 'png',
        resourceType: 'image',
      });
      expect(resolveMediaStorageMetadata('image/webp')).toEqual({
        format: 'webp',
        resourceType: 'image',
      });
      expect(resolveMediaStorageMetadata('application/pdf')).toEqual({
        format: 'pdf',
        resourceType: 'raw',
      });
      expect(resolveMediaStorageMetadata('audio/mpeg')).toBeNull();
      expect(resolveMediaStorageMetadata(null)).toBeNull();
    });
  });

  describe('sanitizeFileName', () => {
    it('strips directory paths and control characters while keeping clean filenames', () => {
      expect(sanitizeFileName('../../evil\\resume\u0000.pdf', 'pdf')).toBe(
        'resume.pdf',
      );
      expect(sanitizeFileName('  photo.png  ', 'png')).toBe('photo.png');
    });

    it('falls back when filename is missing, empty, or dot traversal', () => {
      expect(sanitizeFileName(undefined, 'png')).toBe('attachment.png');
      expect(sanitizeFileName('   ', 'jpg')).toBe('attachment.jpg');
      expect(sanitizeFileName('..', 'pdf')).toBe('attachment.pdf');
      expect(sanitizeFileName('.', 'webp')).toBe('attachment.webp');
    });

    it('truncates filenames exceeding 255 characters while preserving the extension', () => {
      const longName = `${'a'.repeat(260)}.pdf`;
      const result = sanitizeFileName(longName, 'pdf');
      expect(result.length).toBe(255);
      expect(result.endsWith('.pdf')).toBe(true);
    });
  });
});
