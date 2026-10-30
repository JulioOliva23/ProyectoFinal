import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { createValidationPipe } from '../src/common/validation/validation-messages';

enum Color {
  RED = 'RED',
}

class LineDto {
  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;
}

class SampleDto {
  @IsString()
  @Length(3, 10)
  name!: string;

  @IsUUID()
  id!: string;

  @IsEnum(Color)
  color!: Color;

  @Matches(/^[A-Z]+$/, { message: 'El código solo admite mayúsculas' })
  code!: string;

  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}

async function messagesFor(payload: object): Promise<string[]> {
  const pipe: ValidationPipe = createValidationPipe();
  try {
    await pipe.transform(payload, { type: 'body', metatype: SampleDto });
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: string[] }).message;
  }
  throw new Error('the payload was expected to be rejected');
}

const valid = { name: 'Pantalla', id: '5b2e4f0a-1c3d-4e5f-8a9b-0c1d2e3f4a5b', color: 'RED', code: 'ABC', lines: [{ quantity: 1 }] };

describe('Validation messages in Spanish (C6.2)', () => {
  it('accepts a valid payload untouched [001/RNF-4]', async () => {
    await expect(createValidationPipe().transform(valid, { type: 'body', metatype: SampleDto })).resolves.toMatchObject({ name: 'Pantalla' });
  });

  it('explains length, uuid and enum errors in Spanish [001/RNF-4]', async () => {
    const messages = await messagesFor({ ...valid, name: 'ab', id: 'x', color: 'BLUE' });
    expect(messages).toEqual(
      expect.arrayContaining([
        'El campo «name» debe tener al menos 3 caracteres',
        'El campo «id» debe ser un identificador válido',
        'El campo «color» tiene un valor no permitido',
      ]),
    );
  });

  it('explains number bounds and array sizes, with the nested path [001/RNF-4]', async () => {
    const messages = await messagesFor({ ...valid, lines: [{ quantity: 99 }, { quantity: 0 }, { quantity: 1 }] });
    expect(messages).toEqual(
      expect.arrayContaining([
        'El campo «lines» no puede tener más de 2 elementos',
        'El campo «lines.0.quantity» no puede ser mayor que 50',
        'El campo «lines.1.quantity» no puede ser menor que 1',
      ]),
    );
  });

  it('rejects unknown fields in Spanish [001/RNF-4]', async () => {
    const messages = await messagesFor({ ...valid, hacker: true });
    expect(messages).toContain('El campo «hacker» no está permitido');
  });

  it('keeps a custom Spanish message as written [001/RNF-4]', async () => {
    const messages = await messagesFor({ ...valid, code: 'abc' });
    expect(messages).toContain('El código solo admite mayúsculas');
  });

  it('never leaves an English default message behind [001/RNF-4]', async () => {
    const messages = await messagesFor({ name: 1, id: 1, color: 1, code: 1, lines: 'x' });
    for (const message of messages) expect(message).toMatch(/^El campo «|^[A-ZÁÉÍÓÚ]/);
    expect(messages.join(' ')).not.toMatch(/\bmust\b|\bshould\b/);
  });
});
