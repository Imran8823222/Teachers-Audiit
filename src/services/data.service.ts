import { Injectable, signal } from '@angular/core';
import { Teacher, Audit, Department, Campus, ClassworkAudit, ErrorCountRange } from '../models';

const STORAGE_KEY = 'multiCampusTeacherAuditData';

interface AppData {
  campuses: Campus[];
  teachers: Teacher[];
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private campusesSignal = signal<Campus[]>([]);
  private teachersSignal = signal<Teacher[]>([]);

  campuses = this.campusesSignal.asReadonly();
  teachers = this.teachersSignal.asReadonly();

  constructor() {
    this.loadFromStorage();
  }

  public calculateAuditScore(audit: Audit): number {
    if (audit.type === 'Classroom') {
        const { teachingEffectiveness, classControl, timeManagement, professionalSkills } = audit;
        return teachingEffectiveness.rating + classControl.rating + timeManagement.rating + professionalSkills.rating;
    }
    if (audit.type === 'Classwork') {
        const errorRangeScores: Record<ErrorCountRange, number> = {
            '0-2': 5,
            '3-4': 4,
            '5-6': 3,
            '7-8': 2,
            '9-10': 1,
        };
        const score = errorRangeScores[audit.spellingErrors] +
                      errorRangeScores[audit.grammaticalErrors] +
                      errorRangeScores[audit.correctionErrors] +
                      errorRangeScores[audit.outstandingTopics];
        return score; // Max score is 20
    }
    return 0;
  }

  private saveToStorage() {
    const appData: AppData = {
      campuses: this.campusesSignal(),
      teachers: this.teachersSignal(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  }

  private loadFromStorage() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const appData: AppData = JSON.parse(data);
      this.campusesSignal.set(appData.campuses || []);
      this.teachersSignal.set(appData.teachers || []);
    } else {
      const defaultCampuses: Campus[] = [
        { id: crypto.randomUUID(), name: 'Malakpet' },
        { id: crypto.randomUUID(), name: 'Chanchalguda' },
      ];
      this.campusesSignal.set(defaultCampuses);
      this.teachersSignal.set([]);
      this.saveToStorage();
    }
  }

  addCampus(name: string) {
    const newCampus: Campus = {
      id: crypto.randomUUID(),
      name,
    };
    this.campusesSignal.update(campuses => [...campuses, newCampus]);
    this.saveToStorage();
  }

  deleteCampus(campusId: string) {
    this.teachersSignal.update(teachers => teachers.filter(t => t.campusId !== campusId));
    this.campusesSignal.update(campuses => campuses.filter(c => c.id !== campusId));
    this.saveToStorage();
  }

  addTeacher(name: string, department: Department, campusId: string) {
    const newTeacher: Teacher = {
      id: crypto.randomUUID(),
      name,
      department,
      campusId,
      audits: [],
    };
    this.teachersSignal.update(teachers => [...teachers, newTeacher]);
    this.saveToStorage();
  }
  
  deleteTeacher(teacherId: string) {
    this.teachersSignal.update(teachers => teachers.filter(t => t.id !== teacherId));
    this.saveToStorage();
  }

  addAudit(teacherId: string, audit: Audit) {
    const teachers = this.teachersSignal();
    const teacherIndex = teachers.findIndex(t => t.id === teacherId);
    if (teacherIndex > -1) {
        const newTeachers = [...teachers];
        const teacher = newTeachers[teacherIndex];
        const newAudits = [...teacher.audits, audit];
        newTeachers[teacherIndex] = { ...teacher, audits: newAudits };
        this.teachersSignal.set(newTeachers);
        this.saveToStorage();
    }
  }

  updateAudit(teacherId: string, updatedAudit: Audit) {
    const teachers = this.teachersSignal();
    const teacherIndex = teachers.findIndex(t => t.id === teacherId);
    if (teacherIndex > -1) {
        const newTeachers = [...teachers];
        const teacher = newTeachers[teacherIndex];
        const newAudits = teacher.audits.map(audit => audit.id === updatedAudit.id ? updatedAudit : audit);
        newTeachers[teacherIndex] = { ...teacher, audits: newAudits };
        this.teachersSignal.set(newTeachers);
        this.saveToStorage();
    }
  }

  deleteAudit(teacherId: string, auditId: string) {
    const teachers = this.teachersSignal();
    const teacherIndex = teachers.findIndex(t => t.id === teacherId);
    if (teacherIndex > -1) {
        const newTeachers = [...teachers];
        const teacher = newTeachers[teacherIndex];
        const newAudits = teacher.audits.filter(a => a.id !== auditId);
        newTeachers[teacherIndex] = { ...teacher, audits: newAudits };
        this.teachersSignal.set(newTeachers);
        this.saveToStorage();
    }
  }

  updateAuditSummary(teacherId: string, auditId: string, summary: string) {
    const teachers = this.teachersSignal();
    const teacherIndex = teachers.findIndex(t => t.id === teacherId);
    if (teacherIndex > -1) {
        const newTeachers = [...teachers];
        const teacher = newTeachers[teacherIndex];
        const newAudits = teacher.audits.map(audit => {
            if (audit.id === auditId) {
                return { ...audit, summary };
            }
            return audit;
        });
        newTeachers[teacherIndex] = { ...teacher, audits: newAudits };
        this.teachersSignal.set(newTeachers);
        this.saveToStorage();
    }
  }

  clearAllData() {
    localStorage.removeItem(STORAGE_KEY);
    this.campusesSignal.set([]);
    this.teachersSignal.set([]);
  }
}