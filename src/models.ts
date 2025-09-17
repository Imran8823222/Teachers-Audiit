export type Department = 'Pre-Primary' | 'Primary' | 'High School';

export interface Campus {
  id: string;
  name: string;
}

export interface Teacher {
  id: string;
  name: string;
  campusId: string;
  department: Department;
  audits: Audit[];
}

export type Audit = ClassroomAudit | ClassworkAudit;

export interface BaseAudit {
  id:string;
  teacherId: string;
  date: string;
  auditorName: string;
  summary?: string;
}

export interface AuditParameterFeedback {
  continue: string;
  stop: string;
  start: string;
}

export interface AuditParameter {
  rating: number; // 1 to 5
  feedback: AuditParameterFeedback;
}

export interface ClassroomAudit extends BaseAudit {
  type: 'Classroom';
  teachingEffectiveness: AuditParameter;
  classControl: AuditParameter;
  timeManagement: AuditParameter;
  professionalSkills: AuditParameter;
}

export type ErrorCountRange = '0-2' | '3-4' | '5-6' | '7-8' | '9-10';

export interface ClassworkAudit extends BaseAudit {
  type: 'Classwork';
  class: string;
  studentName: string;
  subject: string;
  lessonName: string;
  pageNumber: string;
  comments: string;
  studentFeedback: string;
  spellingErrors: ErrorCountRange;
  grammaticalErrors: ErrorCountRange;
  correctionErrors: ErrorCountRange;
  outstandingTopics: ErrorCountRange;
  targetDate?: string;
  followUpComments?: string;
}

export interface TeacherRanking {
    teacherId: string;
    teacherName: string;
    department: Department;
    averageScore: number;
    auditCount: number;
}