import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

// C6.2: every message a person can read is in Spanish. class-validator writes
// its defaults in English, so they are rewritten from the constraint name.
// A custom message (already written in Spanish at the decorator) is kept as is.

const numbersIn = (message: string): number[] => [...message.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));

type Tail = (defaultMessage: string) => string;

const TAILS: Readonly<Record<string, Tail>> = {
  isLength: (message) => {
    const [min, max] = numbersIn(message);
    if (message.includes('longer') && message.includes('shorter')) return `debe tener entre ${min} y ${max} caracteres`;
    return message.includes('longer') ? `debe tener al menos ${min} caracteres` : `no puede superar ${min} caracteres`;
  },
  minLength: (message) => `debe tener al menos ${numbersIn(message)[0]} caracteres`,
  maxLength: (message) => `no puede superar ${numbersIn(message)[0]} caracteres`,
  min: (message) => `no puede ser menor que ${numbersIn(message)[0]}`,
  max: (message) => `no puede ser mayor que ${numbersIn(message)[0]}`,
  arrayMinSize: (message) => `debe tener al menos ${numbersIn(message)[0]} elementos`,
  arrayMaxSize: (message) => `no puede tener más de ${numbersIn(message)[0]} elementos`,
  arrayUnique: () => 'no puede tener elementos repetidos',
  isInt: () => 'debe ser un número entero',
  isNumber: () => 'debe ser un número',
  isString: () => 'debe ser un texto',
  isBoolean: () => 'debe ser verdadero o falso',
  isArray: () => 'debe ser una lista',
  isUuid: () => 'debe ser un identificador válido',
  isEnum: () => 'tiene un valor no permitido',
  isEmail: () => 'debe ser un correo electrónico válido',
  isIso8601: () => 'debe ser una fecha válida',
  isDefined: () => 'es obligatorio',
  isNotEmpty: () => 'es obligatorio',
  matches: () => 'no tiene el formato esperado',
  whitelistValidation: () => 'no está permitido',
};

function isDefaultMessage(message: string, property: string): boolean {
  return message.startsWith(property) || message.startsWith('each value in ');
}

function flatten(errors: readonly ValidationError[], parent = ''): string[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(([key, message]) => {
      if (key !== 'whitelistValidation' && !isDefaultMessage(message, error.property)) return message;
      const tail = TAILS[key]?.(message) ?? 'no es válido';
      return `El campo «${path}» ${tail}`;
    });
    return [...own, ...flatten(error.children ?? [], path)];
  });
}

export function translateValidationErrors(errors: readonly ValidationError[]): string[] {
  return flatten(errors);
}

// BE-11: strict global validation (whitelist + forbidNonWhitelisted), shared by
// the application and the e2e suites so both answer in the same language.
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new BadRequestException(translateValidationErrors(errors)),
  });
}
