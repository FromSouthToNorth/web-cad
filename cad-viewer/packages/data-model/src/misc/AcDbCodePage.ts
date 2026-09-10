export enum AcDbCodePage {
  UTF8 = 0,
  US_ASCII = 1,
  ISO_8859_1,
  ISO_8859_2,
  ISO_8859_3,
  ISO_8859_4,
  ISO_8859_5,
  ISO_8859_6,
  ISO_8859_7,
  ISO_8859_8,
  ISO_8859_9,
  CP437, // DOS English
  CP850, // 12 DOS Latin-1
  CP852, // DOS Central European
  CP855, // DOS Cyrillic
  CP857, // DOS Turkish
  CP860, // DOS Portoguese
  CP861, // DOS Icelandic
  CP863, // DOS Hebrew
  CP864, // DOS Arabic (IBM)
  CP865, // DOS Nordic
  CP869, // DOS Greek
  CP932, // DOS Japanese (shiftjis)
  MACINTOSH, // 23
  BIG5,
  CP949 = 25, // Korean (Wansung + Johab)
  JOHAB = 26, // Johab?
  CP866 = 27, // Russian
  ANSI_1250 = 28, // Central + Eastern European
  ANSI_1251 = 29, // Cyrillic
  ANSI_1252 = 30, // Western European
  GB2312 = 31, // EUC-CN Chinese
  ANSI_1253, // Greek
  ANSI_1254, // Turkish
  ANSI_1255, // Hebrew
  ANSI_1256, // Arabic
  ANSI_1257, // Baltic
  ANSI_874, // Thai
  ANSI_932, // 38 Japanese (extended shiftjis, windows-31j)
  ANSI_936, // 39 Simplified Chinese
  ANSI_949, // 40 Korean Wansung
  ANSI_950, // 41 Trad Chinese
  ANSI_1361, // 42 Korean Wansung
  UTF16 = 43,
  ANSI_1258 = 44, // Vietnamese
  UNDEFINED = 0xff // mostly R11
}
