import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateMentorDto } from './create-mentor.dto.js';
import { UpdateMentorDto } from './update-mentor.dto.js';
import { MentorQueryDto } from './mentor-query.dto.js';

const valid = {
  headline: 'Mentor',
  about: 'Backend teaching',
  skills: ['NestJS'],
  yearsOfExperience: 1,
};
describe('mentor profile validation', () => {
  it('treats blank optional LinkedIn fields as omitted on creation and update', () => {
    for (const linkedinUrl of ['', '   ']) {
      const created = plainToInstance(CreateMentorDto, {
        ...valid,
        linkedinUrl,
      });
      const updated = plainToInstance(UpdateMentorDto, { linkedinUrl });
      expect(validateSync(created)).toEqual([]);
      expect(validateSync(updated)).toEqual([]);
      expect(created.linkedinUrl).toBeUndefined();
      expect(updated.linkedinUrl).toBeUndefined();
    }
  });
  it('rejects experience above 60 years in create, update and filters', () => {
    for (const value of [61, '61', 2147483648, Number.MAX_SAFE_INTEGER]) {
      for (const dto of [
        plainToInstance(CreateMentorDto, {
          ...valid,
          yearsOfExperience: value,
        }),
        plainToInstance(UpdateMentorDto, { yearsOfExperience: value }),
        plainToInstance(MentorQueryDto, { minExperience: value }),
      ]) {
        expect(validateSync(dto).some((error) => error.constraints?.max)).toBe(
          true,
        );
      }
    }
    expect(
      validateSync(
        plainToInstance(CreateMentorDto, {
          ...valid,
          yearsOfExperience: 60,
        }),
      ),
    ).toEqual([]);
    expect(
      validateSync(
        plainToInstance(MentorQueryDto, {
          minExperience: 60,
        }),
      ),
    ).toEqual([]);
  });
  it('accepts at least one skill and one year with an optional LinkedIn URL', () => {
    for (const linkedinUrl of [
      undefined,
      'https://linkedin.com/in/example',
      'https://www.linkedin.com/in/example',
    ]) {
      expect(
        validateSync(
          plainToInstance(CreateMentorDto, { ...valid, linkedinUrl }),
        ),
      ).toEqual([]);
    }
  });
  it('rejects missing, empty and blank skills and nonpositive or fractional experience', () => {
    for (const fields of [
      { skills: undefined },
      { skills: 'NestJS,TypeScript' },
      { skills: '["NestJS"]' },
      { skills: [] },
      { skills: ['  '] },
      { yearsOfExperience: 0 },
      { yearsOfExperience: -1 },
      { yearsOfExperience: 0.5 },
    ]) {
      expect(
        validateSync(plainToInstance(CreateMentorDto, { ...valid, ...fields }))
          .length,
      ).toBeGreaterThan(0);
    }
  });
  it('rejects other sites and misleading LinkedIn URLs', () => {
    for (const linkedinUrl of [
      'https://example.com',
      'https://linkedin.com.example.com/in/test',
      'https://example.com/linkedin.com',
      'https://linkedin.com@example.com',
      'https://example.com@linkedin.com',
      'ftp://linkedin.com/in/test',
    ]) {
      expect(
        validateSync(
          plainToInstance(CreateMentorDto, { ...valid, linkedinUrl }),
        ).length,
      ).toBeGreaterThan(0);
    }
  });
  it('inherits the same rules on updates while allowing omitted fields', () => {
    expect(validateSync(plainToInstance(UpdateMentorDto, {}))).toEqual([]);
    for (const fields of [
      { skills: [] },
      { yearsOfExperience: 0 },
      { linkedinUrl: 'https://example.com' },
    ]) {
      expect(
        validateSync(plainToInstance(UpdateMentorDto, fields)).length,
      ).toBeGreaterThan(0);
    }
  });
});
