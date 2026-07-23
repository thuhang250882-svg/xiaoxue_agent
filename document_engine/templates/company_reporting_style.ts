import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  PageNumber,
  PageOrientation,
  Paragraph,
  TextRun,
} from "docx"
import type { FileChild } from "docx"

export const COMPANY_REPORTING_FORMAT = {
  id: "company_reporting_default",
  name: "上报文字材料排版格式",
  source: "configs/templates/上报文字材料排版格式要求.docx",
  page: {
    width: 11906,
    height: 16838,
    margin: {
      top: 2098,
      bottom: 1984,
      left: 1587,
      right: 1474,
      header: 850,
      footer: 992,
    },
    contentWidth: 8845,
  },
  font: {
    title: "方正小标宋简体",
    heading1: "方正黑体简体",
    heading2: "方正楷体简体",
    body: "方正仿宋简体",
  },
  size: {
    title: 44,
    body: 32,
    pageNumber: 28,
  },
  spacing: {
    titleSingleLine: 560,
    titleMultipleLines: 640,
    body: 560,
  },
  indent: {
    firstLine: 640,
  },
  color: "000000",
} as const

export type CompanyReportingDocumentInput = {
  title: string
  children: readonly FileChild[]
  subject?: string
  creator?: string
  description?: string
}

export function createCompanyReportingDocument(input: CompanyReportingDocumentInput) {
  return new Document({
    title: input.title,
    subject: input.subject,
    creator: input.creator ?? "录井小雪",
    description: input.description ?? `按《${COMPANY_REPORTING_FORMAT.name}》生成`,
    evenAndOddHeaderAndFooters: true,
    styles: {
      default: {
        document: {
          run: companyRunStyle(COMPANY_REPORTING_FORMAT.font.body, COMPANY_REPORTING_FORMAT.size.body),
          paragraph: {
            spacing: {
              before: 0,
              after: 0,
              line: COMPANY_REPORTING_FORMAT.spacing.body,
              lineRule: LineRuleType.EXACT,
            },
          },
        },
        title: {
          run: companyRunStyle(COMPANY_REPORTING_FORMAT.font.title, COMPANY_REPORTING_FORMAT.size.title),
          paragraph: {
            alignment: AlignmentType.CENTER,
            keepNext: true,
            spacing: {
              before: 0,
              after: 0,
              line: COMPANY_REPORTING_FORMAT.spacing.titleSingleLine,
              lineRule: LineRuleType.EXACT,
            },
          },
        },
        heading1: companyHeadingStyle(COMPANY_REPORTING_FORMAT.font.heading1),
        heading2: companyHeadingStyle(COMPANY_REPORTING_FORMAT.font.heading2),
        heading3: companyHeadingStyle(COMPANY_REPORTING_FORMAT.font.body, true),
        heading4: companyHeadingStyle(COMPANY_REPORTING_FORMAT.font.body),
      },
    },
    numbering: {
      config: [
        {
          reference: "company-reporting-decimal",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 960, hanging: 320 } },
                run: companyRunStyle(COMPANY_REPORTING_FORMAT.font.body, COMPANY_REPORTING_FORMAT.size.body),
              },
            },
          ],
        },
        {
          reference: "company-reporting-bullet",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 960, hanging: 320 } },
                run: companyRunStyle(COMPANY_REPORTING_FORMAT.font.body, COMPANY_REPORTING_FORMAT.size.body),
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: COMPANY_REPORTING_FORMAT.page.width,
              height: COMPANY_REPORTING_FORMAT.page.height,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: COMPANY_REPORTING_FORMAT.page.margin,
            pageNumbers: { start: 1 },
          },
        },
        footers: {
          default: pageNumberFooter(AlignmentType.RIGHT),
          even: pageNumberFooter(AlignmentType.LEFT),
        },
        children: input.children,
      },
    ],
  })
}

export function companyTitle(text: string) {
  return new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    keepNext: true,
    spacing: {
      before: 0,
      after: 0,
      line:
        text.includes("\n") || text.length > 22
          ? COMPANY_REPORTING_FORMAT.spacing.titleMultipleLines
          : COMPANY_REPORTING_FORMAT.spacing.titleSingleLine,
      lineRule: LineRuleType.EXACT,
    },
    children: [new TextRun(text)],
  })
}

export function companyHeading(text: string, level: 1 | 2 | 3 | 4 = 1) {
  const heading = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][
    level - 1
  ]

  return new Paragraph({
    heading,
    children: [new TextRun(text)],
  })
}

export function companyBodyParagraph(text: string, options?: { firstLine?: boolean; bold?: boolean }) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: options?.firstLine === false ? undefined : { firstLine: COMPANY_REPORTING_FORMAT.indent.firstLine },
    spacing: {
      before: 0,
      after: 0,
      line: COMPANY_REPORTING_FORMAT.spacing.body,
      lineRule: LineRuleType.EXACT,
    },
    children: [new TextRun({ text: text || "无", bold: options?.bold })],
  })
}

export function companyLabelParagraph(label: string, value: string) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: COMPANY_REPORTING_FORMAT.indent.firstLine },
    spacing: {
      before: 0,
      after: 0,
      line: COMPANY_REPORTING_FORMAT.spacing.body,
      lineRule: LineRuleType.EXACT,
    },
    children: [new TextRun({ text: `${label}：`, bold: true }), new TextRun(value || "无")],
  })
}

export function companyTableParagraph(text: string, bold = false) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: {
      before: 0,
      after: 0,
      line: COMPANY_REPORTING_FORMAT.spacing.body,
      lineRule: LineRuleType.EXACT,
    },
    children: [new TextRun({ text: text || "无", bold })],
  })
}

export function companyNumberedParagraph(text: string) {
  return new Paragraph({
    numbering: { reference: "company-reporting-decimal", level: 0 },
    spacing: {
      before: 0,
      after: 0,
      line: COMPANY_REPORTING_FORMAT.spacing.body,
      lineRule: LineRuleType.EXACT,
    },
    children: [new TextRun(text)],
  })
}

export function companyBulletParagraph(text: string) {
  return new Paragraph({
    numbering: { reference: "company-reporting-bullet", level: 0 },
    spacing: {
      before: 0,
      after: 0,
      line: COMPANY_REPORTING_FORMAT.spacing.body,
      lineRule: LineRuleType.EXACT,
    },
    children: [new TextRun(text)],
  })
}

export function companyRightAlignedParagraph(text: string) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: {
      before: 0,
      after: 0,
      line: COMPANY_REPORTING_FORMAT.spacing.body,
      lineRule: LineRuleType.EXACT,
    },
    children: [new TextRun(text)],
  })
}

function companyHeadingStyle(font: string, bold = false) {
  return {
    run: companyRunStyle(font, COMPANY_REPORTING_FORMAT.size.body, bold),
    paragraph: {
      indent: { firstLine: COMPANY_REPORTING_FORMAT.indent.firstLine },
      keepNext: true,
      keepLines: true,
      spacing: {
        before: 0,
        after: 0,
        line: COMPANY_REPORTING_FORMAT.spacing.body,
        lineRule: LineRuleType.EXACT,
      },
    },
  }
}

function companyRunStyle(font: string, size: number, bold = false) {
  return {
    font: {
      ascii: "Times New Roman",
      hAnsi: "Times New Roman",
      eastAsia: font,
      cs: "Times New Roman",
    },
    size,
    bold,
    color: COMPANY_REPORTING_FORMAT.color,
  }
}

function pageNumberFooter(alignment: (typeof AlignmentType)[keyof typeof AlignmentType]) {
  return new Footer({
    children: [
      new Paragraph({
        alignment,
        children: [
          new TextRun({
            children: [PageNumber.CURRENT],
            ...companyRunStyle(COMPANY_REPORTING_FORMAT.font.body, COMPANY_REPORTING_FORMAT.size.pageNumber),
          }),
        ],
      }),
    ],
  })
}
