import { Component, ChangeDetectionStrategy, signal, inject, WritableSignal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from './services/data.service';
import { GeminiService } from './services/gemini.service';
import { Teacher, Department, ClassroomAudit, ClassworkAudit, Audit, AuditParameter, ErrorCountRange, TeacherRanking, Campus } from './models';

declare const html2canvas: any;
declare const jspdf: any;

type View = 'list' | 'dashboard' | 'classroom-audit' | 'classwork-audit' | 'ranking' | 'follow-up-calendar' | 'classroom-audit-printable' | 'classwork-audit-printable';
type ClassroomAuditFormParameters = Pick<ClassroomAudit, 'teachingEffectiveness' | 'classControl' | 'timeManagement' | 'professionalSkills'>;
type CalendarDay = { date: Date; isCurrentMonth: boolean; followUps: { teacherName: string; audit: ClassworkAudit; }[] };

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DatePipe],
})
export class AppComponent {
  dataService = inject(DataService);
  geminiService = inject(GeminiService);

  // View management
  view = signal<View>('list');
  selectedCampus = signal<Campus | null>(null);

  // Campus state
  newCampusName = signal('');

  // Teacher list state
  newTeacherName = signal('');
  newTeacherDept = signal<Department>('Primary');
  departments: Department[] = ['Pre-Primary', 'Primary', 'High School'];
  expandedTeacherId = signal<string | null>(null);

  // Audit state
  selectedTeacher = signal<Teacher | null>(null);
  auditorName = signal('');
  classroomAuditForm: WritableSignal<ClassroomAuditFormParameters> = signal(this.getInitialClassroomForm());
  classworkAuditForm: WritableSignal<Partial<ClassworkAudit>> = signal({});
  auditJustSubmitted = signal(false);
  editingAudit = signal<Audit | null>(null);
  currentAuditMode = signal<'new' | 'edit' | 'view'>('new');
  
  auditParameters: { key: keyof ClassroomAuditFormParameters, title: string, description: string }[] = [
    { key: 'teachingEffectiveness', title: 'Teaching Effectiveness', description: 'Methods & Techniques' },
    { key: 'classControl', title: 'Class Control & Management', description: 'Discipline, engagement, environment' },
    { key: 'timeManagement', title: 'Time & Work Management', description: 'Pacing, planning, syllabus completion' },
    { key: 'professionalSkills', title: 'Language & Professional Skills', description: 'Communication, subject matter expertise' }
  ];
  errorCountRanges: ErrorCountRange[] = ['0-2', '3-4', '5-6', '7-8', '9-10'];
  errorAnalysisParameters: { key: keyof Pick<ClassworkAudit, 'spellingErrors' | 'grammaticalErrors' | 'correctionErrors' | 'outstandingTopics'>, label: string }[] = [
    { key: 'spellingErrors', label: 'Spelling Errors' },
    { key: 'grammaticalErrors', label: 'Grammatical Errors' },
    { key: 'correctionErrors', label: 'Correction Errors (by teacher)' },
    { key: 'outstandingTopics', label: 'Outstanding/Incomplete Topics' }
  ];

  private errorRangeScores: Record<ErrorCountRange, number> = {
    '0-2': 5, '3-4': 4, '5-6': 3, '7-8': 2, '9-10': 1,
  };

  // AI State
  isSummarizing = signal(false);
  summary = signal('');
  formattedSummary = computed(() => this.summary().replace(/\n/g, '<br>'));
  lastCompletedAudit = signal<Audit | null>(null);
  isGeneratingAnalysis = signal(false);
  aiStrengthAnalysis = signal('');
  isGeneratingTeacherAnalysis = signal(false);
  teacherAnalysisReport = signal('');
  selectedTeacherForAnalysis = signal<TeacherRanking | null>(null);
  isGeneratingPraise = signal(false);
  topPerformerPraise = signal('');

  // Rankings state
  rankingFilterStartDate = signal('');
  rankingFilterEndDate = signal('');
  isRankingFilterActive = computed(() => !!this.rankingFilterStartDate() || !!this.rankingFilterEndDate());

  // Calendar state
  calendarDate = signal(new Date()); // The reference date for the current month view
  selectedDateData = signal<CalendarDay | null>(null);

  // Date Picker state
  activeDatePickerFor = signal<'classworkFollowUp' | 'rankingStart' | 'rankingEnd' | null>(null);
  datePickerCalendarDate = signal(new Date());

  // Dashboard state
  dashboardTimeFilter = signal<'week' | 'month' | 'quarter' | 'half' | 'year'>('month');
  dashboardDepartmentFilter = signal<'All' | Department>('All');
  timeFilters: { key: 'week' | 'month' | 'quarter' | 'half' | 'year'; label: string }[] = [
      { key: 'week', label: 'This Week' },
      { key: 'month', label: 'This Month' },
      { key: 'quarter', label: 'This Quarter' },
      { key: 'half', label: 'This Half-Year' },
      { key: 'year', label: 'This Year' },
  ];
  departmentFilters: ('All' | Department)[] = ['All', 'Pre-Primary', 'Primary', 'High School'];
  
  teachersOnCampus = computed(() => {
    const campus = this.selectedCampus();
    if (!campus) return [];
    return this.dataService.teachers().filter(t => t.campusId === campus.id);
  });
  
  rankings = computed(() => {
    const teachers = this.teachersOnCampus();
    const startDate = this.rankingFilterStartDate();
    const endDate = this.rankingFilterEndDate();

    const departments: Department[] = ['Pre-Primary', 'Primary', 'High School'];
    const rankedByDept: Record<Department, TeacherRanking[]> = {
      'Pre-Primary': [],
      'Primary': [],
      'High School': [],
    };

    teachers.forEach(teacher => {
      const filteredAudits = teacher.audits.filter(audit => {
        if (!startDate && !endDate) return true;
        const auditDate = new Date(audit.date);
        const startObj = startDate ? new Date(startDate + 'T00:00:00') : null;
        const endObj = endDate ? new Date(endDate + 'T23:59:59') : null;
        const afterStart = startObj ? auditDate >= startObj : true;
        const beforeEnd = endObj ? auditDate <= endObj : true;
        return afterStart && beforeEnd;
      });

      let totalScore = 0;
      if (filteredAudits.length > 0) {
        const scores = filteredAudits.map(audit => this.dataService.calculateAuditScore(audit));
        totalScore = scores.reduce((sum, score) => sum + score, 0) / filteredAudits.length;
      }
      
      const ranking: TeacherRanking = {
        teacherId: teacher.id,
        teacherName: teacher.name,
        department: teacher.department,
        averageScore: isNaN(totalScore) ? 0 : parseFloat(totalScore.toFixed(2)),
        auditCount: filteredAudits.length,
      };

      if (rankedByDept[teacher.department]) {
        rankedByDept[teacher.department].push(ranking);
      }
    });

    departments.forEach(dept => {
        rankedByDept[dept].sort((a, b) => b.averageScore - a.averageScore);
    });
    
    return rankedByDept;
  });

  classworkFollowUpsByDate = computed(() => {
    const teachers = this.teachersOnCampus();
    const followUps: Record<string, { teacherName: string; audit: ClassworkAudit }[]> = {};

    teachers.forEach(teacher => {
      teacher.audits.forEach(audit => {
        if (audit.type === 'Classwork' && audit.targetDate) {
          const dateStr = audit.targetDate;
          if (!followUps[dateStr]) {
            followUps[dateStr] = [];
          }
          followUps[dateStr].push({ teacherName: teacher.name, audit });
        }
      });
    });

    return followUps;
  });

  filteredAuditsForDashboard = computed(() => {
    const teachersForCampus = this.teachersOnCampus();
    const departmentFilter = this.dashboardDepartmentFilter();
    const timeFilter = this.dashboardTimeFilter();
    
    const relevantTeachers = departmentFilter === 'All' 
        ? teachersForCampus 
        : teachersForCampus.filter(t => t.department === departmentFilter);

    const now = new Date();
    let startDate: Date;

    switch (timeFilter) {
        case 'week':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'quarter':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            break;
        case 'half':
            const half = now.getMonth() < 6 ? 0 : 6;
            startDate = new Date(now.getFullYear(), half, 1);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
    }
    startDate.setHours(0, 0, 0, 0);

    return relevantTeachers.flatMap(t => 
        t.audits.map(a => ({ ...a, teacherName: t.name, department: t.department }))
    ).filter(audit => new Date(audit.date) >= startDate);
  });

  dashboardData = computed(() => {
    const allAudits = this.filteredAuditsForDashboard();
    
    if (allAudits.length === 0) {
        return {
            totalAudits: 0,
            averageScore: 0,
            classroomAudits: 0,
            classworkAudits: 0,
            topTeachers: [],
            auditorContributions: [],
            hasData: false,
        };
    }

    const totalScore = allAudits.reduce((sum, audit) => {
        const rawScore = this.dataService.calculateAuditScore(audit);
        const maxScore = 20; // Both audit types have a max raw score of 20
        const normalizedScore = (rawScore / maxScore) * 5;
        return sum + normalizedScore;
    }, 0);
    
    const averageScore = parseFloat((totalScore / allAudits.length).toFixed(1));

    const classroomAudits = allAudits.filter(a => a.type === 'Classroom').length;
    const classworkAudits = allAudits.length - classroomAudits;
    
    const teacherScores: { [teacherId: string]: { totalScore: number; count: number; name: string; department: Department; } } = {};
    allAudits.forEach(audit => {
        if (!teacherScores[audit.teacherId]) {
            teacherScores[audit.teacherId] = { totalScore: 0, count: 0, name: audit.teacherName, department: audit.department };
        }
        const rawScore = this.dataService.calculateAuditScore(audit);
        const maxScore = 20;
        const normalizedScore = (rawScore / maxScore) * 5;
        teacherScores[audit.teacherId].totalScore += normalizedScore;
        teacherScores[audit.teacherId].count++;
    });

    const topTeachers: TeacherRanking[] = Object.entries(teacherScores)
        .map(([teacherId, t]) => ({
            teacherId,
            teacherName: t.name,
            department: t.department,
            averageScore: parseFloat((t.totalScore / t.count).toFixed(1)),
            auditCount: t.count
        }))
        .sort((a, b) => b.averageScore - a.averageScore)
        .slice(0, 5);
    
    const auditorCounts: { [name: string]: number } = {};
    allAudits.forEach(audit => {
        auditorCounts[audit.auditorName] = (auditorCounts[audit.auditorName] || 0) + 1;
    });

    const auditorContributions = Object.entries(auditorCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    return {
        totalAudits: allAudits.length,
        averageScore: isNaN(averageScore) ? 0 : averageScore,
        classroomAudits,
        classworkAudits,
        topTeachers,
        auditorContributions,
        hasData: true,
    };
  });

  datePickerCalendarView = computed(() => {
    const date = this.datePickerCalendarDate();
    const year = date.getFullYear();
    const month = date.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const firstDayOfWeek = firstDayOfMonth.getDay();
    const daysInMonth = lastDayOfMonth.getDate();

    const days: { date: Date; isCurrentMonth: boolean; }[] = [];

    // Days from previous month
    for (let i = 0; i < firstDayOfWeek; i++) {
        const d = new Date(firstDayOfMonth);
        d.setDate(d.getDate() - (firstDayOfWeek - i));
        days.push({ date: d, isCurrentMonth: false });
    }

    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
        const currentDay = new Date(year, month, i);
        days.push({ date: currentDay, isCurrentMonth: true });
    }

    // Days from next month
    let nextMonthDay = 1;
    while (days.length % 7 !== 0) {
        const d = new Date(lastDayOfMonth);
        d.setDate(d.getDate() + nextMonthDay);
        days.push({ date: d, isCurrentMonth: false });
        nextMonthDay++;
    }

    return days;
  });

  calendarView = computed(() => {
    const date = this.calendarDate();
    const followUpsMap = this.classworkFollowUpsByDate();
    const year = date.getFullYear();
    const month = date.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const firstDayOfWeek = firstDayOfMonth.getDay();
    const daysInMonth = lastDayOfMonth.getDate();

    const days: CalendarDay[] = [];

    // Days from previous month
    for (let i = 0; i < firstDayOfWeek; i++) {
        const d = new Date(firstDayOfMonth);
        d.setDate(d.getDate() - (firstDayOfWeek - i));
        days.push({ date: d, isCurrentMonth: false, followUps: [] });
    }

    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
        const currentDay = new Date(year, month, i);
        const dateStr = this.formatDateForLookup(currentDay);
        const followUps = followUpsMap[dateStr] || [];
        days.push({ date: currentDay, isCurrentMonth: true, followUps });
    }

    // Days from next month
    let nextMonthDay = 1;
    while (days.length % 7 !== 0) {
        const d = new Date(lastDayOfMonth);
        d.setDate(d.getDate() + nextMonthDay);
        days.push({ date: d, isCurrentMonth: false, followUps: [] });
        nextMonthDay++;
    }
    
    // Ensure 6 weeks for consistent height
    while (days.length < 42) {
      const d = new Date(days[days.length - 1].date);
      d.setDate(d.getDate() + 1);
      days.push({ date: d, isCurrentMonth: false, followUps: [] });
    }

    return days;
  });

  classroomAuditLiveScore = computed(() => {
    const form = this.classroomAuditForm();
    const total = form.teachingEffectiveness.rating +
                  form.classControl.rating +
                  form.timeManagement.rating +
                  form.professionalSkills.rating;
    const average = total / 4;
    return parseFloat(average.toFixed(1));
  });

  classroomAuditLiveRatingText = computed(() => {
    const score = this.classroomAuditLiveScore();
    if (score < 2) return 'Needs Improvement';
    if (score < 3) return 'Fair';
    if (score < 4) return 'Good';
    if (score < 4.5) return 'Very Good';
    return 'Excellent';
  });
  
  classworkAuditLiveScore = computed(() => {
    const form = this.classworkAuditForm();
    if (!form.spellingErrors || !form.grammaticalErrors || !form.correctionErrors || !form.outstandingTopics) {
        return 0;
    }
    const score = this.errorRangeScores[form.spellingErrors] +
                  this.errorRangeScores[form.grammaticalErrors] +
                  this.errorRangeScores[form.correctionErrors] +
                  this.errorRangeScores[form.outstandingTopics];
    // Score is out of 20. Normalize to a 5-point scale for UI consistency.
    const average = (score / 20) * 5;
    return parseFloat(average.toFixed(1));
  });

  classworkAuditLiveRatingText = computed(() => {
    const score = this.classworkAuditLiveScore();
    if (score < 2) return 'Needs Improvement';
    if (score < 3) return 'Fair';
    if (score < 4) return 'Good';
    if (score < 4.5) return 'Very Good';
    return 'Excellent';
  });

  getAuditsByType(audits: readonly Audit[], type: 'Classroom' | 'Classwork'): Audit[] {
    return audits.filter(a => a.type === type);
  }

  private getInitialClassroomForm(): ClassroomAuditFormParameters {
    const initialParam: AuditParameter = { rating: 3, feedback: { continue: '', stop: '', start: '' } };
    return {
      teachingEffectiveness: { ...initialParam, feedback: {...initialParam.feedback} },
      classControl: { ...initialParam, feedback: {...initialParam.feedback} },
      timeManagement: { ...initialParam, feedback: {...initialParam.feedback} },
      professionalSkills: { ...initialParam, feedback: {...initialParam.feedback} },
    };
  }

  addCampus() {
    if (this.newCampusName().trim()) {
      this.dataService.addCampus(this.newCampusName());
      this.newCampusName.set('');
    }
  }

  selectCampus(campus: Campus) {
    this.selectedCampus.set(campus);
    this.view.set('list');
  }

  deselectCampus() {
    this.selectedCampus.set(null);
  }

  deleteCampus(event: MouseEvent, campus: Campus) {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete the "${campus.name}" campus? This will permanently delete ALL associated teachers and their audit data.`)) {
      this.dataService.deleteCampus(campus.id);
    }
  }

  addTeacher() {
    const campus = this.selectedCampus();
    if (this.newTeacherName().trim() && campus) {
      this.dataService.addTeacher(this.newTeacherName(), this.newTeacherDept(), campus.id);
      this.newTeacherName.set('');
    }
  }
  
  deleteTeacher(event: MouseEvent, teacherId: string) {
    event.stopPropagation();
    if(confirm('Are you sure you want to delete this teacher and all their audit data?')) {
        this.dataService.deleteTeacher(teacherId);
    }
  }

  toggleAudits(teacherId: string) {
    this.expandedTeacherId.update(current => current === teacherId ? null : teacherId);
  }

  startClassroomAudit(teacher: Teacher) {
    this.currentAuditMode.set('new');
    this.editingAudit.set(null);
    this.selectedTeacher.set(teacher);
    this.auditorName.set('');
    this.classroomAuditForm.set(this.getInitialClassroomForm());
    this.summary.set('');
    this.lastCompletedAudit.set(null);
    this.auditJustSubmitted.set(false);
    this.view.set('classroom-audit');
  }
  
  setRating(paramKey: keyof ClassroomAuditFormParameters, rating: number) {
    this.classroomAuditForm.update(form => {
        const newForm = JSON.parse(JSON.stringify(form));
        newForm[paramKey].rating = rating;
        return newForm;
    });
  }

  startClassworkAudit(teacher: Teacher) {
    this.currentAuditMode.set('new');
    this.editingAudit.set(null);
    this.selectedTeacher.set(teacher);
    this.auditorName.set('');
    this.classworkAuditForm.set({
      class: '',
      studentName: '',
      subject: '',
      lessonName: '',
      pageNumber: '',
      comments: '',
      studentFeedback: '',
      spellingErrors: '0-2',
      grammaticalErrors: '0-2',
      correctionErrors: '0-2',
      outstandingTopics: '0-2',
      targetDate: '',
      followUpComments: '',
    });
    this.summary.set('');
    this.lastCompletedAudit.set(null);
    this.view.set('classwork-audit');
  }

  updateClassworkErrorRange(
    key: 'spellingErrors' | 'grammaticalErrors' | 'correctionErrors' | 'outstandingTopics',
    range: ErrorCountRange
  ) {
    this.classworkAuditForm.update(form => ({ ...form, [key]: range }));
  }
  
  getRatingForErrorRange(range: ErrorCountRange): number {
    switch (range) {
        case '0-2': return 5;
        case '3-4': return 4;
        case '5-6': return 3;
        case '7-8': return 2;
        case '9-10': return 1;
        default: return 0;
    }
  }

  submitClassroomAudit() {
    const teacher = this.selectedTeacher();
    if (!teacher || !this.auditorName().trim()) {
        alert("Please provide the Auditor's Name.");
        return;
    }
  
    const auditData = this.classroomAuditForm();

    if (this.currentAuditMode() === 'edit' && this.editingAudit()) {
      const updatedAudit: ClassroomAudit = {
        ...(this.editingAudit() as ClassroomAudit),
        ...auditData,
        auditorName: this.auditorName(),
      };
      this.dataService.updateAudit(teacher.id, updatedAudit);
      
      alert('Audit updated successfully!');
      
      this.view.set('list');
      this.expandedTeacherId.set(teacher.id); // Keep teacher expanded
      
      // Reset state for next time
      this.editingAudit.set(null);
      this.currentAuditMode.set('new');
      this.auditJustSubmitted.set(false);
      this.selectedTeacher.set(null);

    } else { // This is the 'new' audit flow
      const newAudit: ClassroomAudit = {
        id: crypto.randomUUID(),
        teacherId: teacher.id,
        date: new Date().toISOString(),
        type: 'Classroom',
        auditorName: this.auditorName(),
        ...auditData,
      };
      this.dataService.addAudit(teacher.id, newAudit);
      this.lastCompletedAudit.set(newAudit);
      this.auditJustSubmitted.set(true);
      this.editingAudit.set(null);
    }
  }

  async generateSummaryForLastAudit() {
    const audit = this.lastCompletedAudit() as ClassroomAudit;
    const teacher = this.selectedTeacher();
    if (!audit || !teacher) return;

    this.isSummarizing.set(true);
    const summaryText = await this.geminiService.summarizeClassroomAudit(audit, teacher.name);
    this.summary.set(summaryText);
    this.isSummarizing.set(false);

    this.dataService.updateAuditSummary(teacher.id, audit.id, summaryText);
    this.lastCompletedAudit.update(a => a ? ({ ...a, summary: summaryText }) : null);
  }

  async submitClassworkAudit() {
    const teacher = this.selectedTeacher();
    const form = this.classworkAuditForm();
    if (!teacher || !this.auditorName().trim() || !form.class || !form.studentName || !form.subject || !form.lessonName || !form.comments) {
      alert('Please fill all required fields: Auditor Name, Class, Student, Subject, Lesson, and Comments.');
      return;
    }
  
    this.isSummarizing.set(true);

    let auditToProcess: ClassworkAudit;

    if (this.currentAuditMode() === 'edit' && this.editingAudit()) {
        auditToProcess = {
            ...(this.editingAudit() as ClassworkAudit),
            ...form as Omit<ClassworkAudit, 'id' | 'teacherId' | 'date' | 'type' | 'summary' | 'auditorName'>,
            auditorName: this.auditorName(),
        };
    } else {
        auditToProcess = {
            id: crypto.randomUUID(),
            teacherId: teacher.id,
            date: new Date().toISOString(),
            type: 'Classwork',
            auditorName: this.auditorName(),
            ...form as Omit<ClassworkAudit, 'id' | 'teacherId' | 'date' | 'type' | 'summary' | 'auditorName'>
        };
    }

    const summaryText = await this.geminiService.summarizeClassworkAudit(auditToProcess, teacher.name);
    auditToProcess.summary = summaryText;
    this.summary.set(summaryText);
    this.lastCompletedAudit.set(auditToProcess);
    
    if (this.currentAuditMode() === 'edit') {
        this.dataService.updateAudit(teacher.id, auditToProcess);
    } else {
        this.dataService.addAudit(teacher.id, auditToProcess);
    }

    this.isSummarizing.set(false);
    this.editingAudit.set(null);
  }

  viewAudit(audit: Audit) {
    this.currentAuditMode.set('view');
    this.prepareAuditForm(audit);
  }

  editAudit(audit: Audit) {
    this.currentAuditMode.set('edit');
    this.prepareAuditForm(audit);
  }

  private prepareAuditForm(audit: Audit) {
    this.editingAudit.set(audit);
    const teacher = this.teachersOnCampus().find(t => t.id === audit.teacherId);
    this.selectedTeacher.set(teacher || null);
    this.auditorName.set(audit.auditorName || '');
    this.summary.set(audit.summary || '');
    this.auditJustSubmitted.set(false);

    if (audit.type === 'Classroom') {
        this.classroomAuditForm.set({
            teachingEffectiveness: audit.teachingEffectiveness,
            classControl: audit.classControl,
            timeManagement: audit.timeManagement,
            professionalSkills: audit.professionalSkills,
        });
        this.view.set('classroom-audit');
    } else { // Classwork
        this.classworkAuditForm.set({
            ...audit,
        });
        this.view.set('classwork-audit');
    }
  }

  deleteAudit(event: MouseEvent, teacherId: string, auditId: string) {
    event.stopPropagation();
    if(confirm('Are you sure you want to delete this audit? This action is permanent.')) {
        this.dataService.deleteAudit(teacherId, auditId);
    }
  }
  
  shareableSummary = computed(() => {
    const teacherName = this.selectedTeacher()?.name;
    const auditType = this.lastCompletedAudit()?.type || this.editingAudit()?.type;
    const header = `*Audit Summary for ${teacherName} (${auditType})*`;
    const summaryText = this.summary();
    return encodeURIComponent(`${header}\n\n${summaryText}`);
  });

  goBack() {
    this.view.set('list');
    this.selectedTeacher.set(null);
    this.editingAudit.set(null);
    this.currentAuditMode.set('new');
    this.auditJustSubmitted.set(false);
    this.activeDatePickerFor.set(null);
  }

  exportRankingsToCSV() {
    const rankings = this.rankings();
    const headers = ['Rank', 'Teacher Name', 'Department', 'Average Score', 'Audit Count'];
    const rows: (string|number)[][] = [];

    this.departments.forEach(dept => {
        const departmentRankings = rankings[dept];
        departmentRankings.forEach((ranking, index) => {
            rows.push([
                index + 1,
                ranking.teacherName,
                ranking.department,
                ranking.averageScore,
                ranking.auditCount
            ]);
        });
    });
    
    const toCsvCell = (cell: any) => {
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(toCsvCell).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'teacher_rankings.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  // Ranking filter methods
  applyRankingFilter() {
    // Data service no longer handles this; the computed signal just recalculates.
    // This method is kept for the button click, but is now a no-op.
    // In a larger app, we might trigger a refresh here if data were async.
  }

  clearRankingFilter() {
      this.rankingFilterStartDate.set('');
      this.rankingFilterEndDate.set('');
  }
  
  // Calendar methods
  formatDateForLookup(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  changeMonth(offset: number) {
      this.calendarDate.update(d => {
          const newDate = new Date(d);
          newDate.setDate(1); // Avoid issues with month lengths
          newDate.setMonth(d.getMonth() + offset);
          return newDate;
      });
      this.selectedDateData.set(null); // Reset selection when changing month
  }

  selectDate(day: CalendarDay) {
      if (day.followUps.length > 0) {
          this.selectedDateData.set(day);
      } else {
          this.selectedDateData.set(null);
      }
  }
  
  getWhatsAppReminder(teacherName: string, audit: ClassworkAudit): string {
    const originalDate = new Date(audit.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const message = `Hi ${teacherName}, this is a friendly reminder for the follow-up based on your classwork audit from ${originalDate}. We're looking forward to discussing your progress. Thank you! - The Team at Fairy's Flower School`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    return url;
  }
  
  // Date Picker methods
  toggleDatePickerFor(type: 'classworkFollowUp' | 'rankingStart' | 'rankingEnd') {
    if (this.activeDatePickerFor() === type) {
        this.activeDatePickerFor.set(null); // Close if already open
        return;
    }

    let currentDate: string | undefined = '';
    switch (type) {
        case 'classworkFollowUp':
            currentDate = this.classworkAuditForm().targetDate;
            break;
        case 'rankingStart':
            currentDate = this.rankingFilterStartDate();
            break;
        case 'rankingEnd':
            currentDate = this.rankingFilterEndDate();
            break;
    }

    if (currentDate) {
        // Add T00:00:00 to avoid timezone issues when parsing YYYY-MM-DD string
        this.datePickerCalendarDate.set(new Date(currentDate + 'T00:00:00'));
    } else {
        this.datePickerCalendarDate.set(new Date());
    }
    this.activeDatePickerFor.set(type);
  }

  changeDatePickerMonth(offset: number) {
      this.datePickerCalendarDate.update(d => {
          const newDate = new Date(d);
          newDate.setDate(1);
          newDate.setMonth(d.getMonth() + offset);
          return newDate;
      });
  }

  selectDateForPicker(date: Date) {
      const pickerType = this.activeDatePickerFor();
      if (!pickerType) return;

      const formattedDate = this.formatDateForLookup(date);
      switch (pickerType) {
          case 'classworkFollowUp':
              this.classworkAuditForm.update(form => ({...form, targetDate: formattedDate }));
              break;
          case 'rankingStart':
              this.rankingFilterStartDate.set(formattedDate);
              break;
          case 'rankingEnd':
              this.rankingFilterEndDate.set(formattedDate);
              break;
      }
      this.activeDatePickerFor.set(null); // Close the picker
  }

  isFollowUpDateSelected(date: Date): boolean {
    const selectedDateStr = this.classworkAuditForm().targetDate;
    if (!selectedDateStr) return false;
    return this.formatDateForLookup(date) === selectedDateStr;
  }

  isRankingDateSelected(date: Date): boolean {
    const formatted = this.formatDateForLookup(date);
    return formatted === this.rankingFilterStartDate() || formatted === this.rankingFilterEndDate();
  }

  isDateInRankingRange(date: Date): boolean {
    let start = this.rankingFilterStartDate();
    let end = this.rankingFilterEndDate();
    if (!start || !end) return false;

    // Ensure start is before end for comparison
    if (start > end) {
      [start, end] = [end, start];
    }

    const formatted = this.formatDateForLookup(date);
    return formatted > start && formatted < end;
  }

  printPage() {
    window.print();
  }

  async downloadFormAsPDF() {
    const { jsPDF } = jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pdfWidth - margin * 2;

    const headerEl = document.getElementById('printable-form-header');
    const sectionEls = document.querySelectorAll('.printable-section');

    if (!headerEl || sectionEls.length === 0) {
        console.error('Printable form elements not found.');
        alert('Could not find form elements to generate PDF.');
        return;
    }

    try {
        const headerCanvas = await html2canvas(headerEl, { scale: 2 });
        const headerImgData = headerCanvas.toDataURL('image/png');
        const headerImgHeight = (headerCanvas.height * contentWidth) / headerCanvas.width;

        for (let i = 0; i < sectionEls.length; i++) {
            const sectionEl = sectionEls[i] as HTMLElement;

            if (i > 0) {
                pdf.addPage();
            }

            pdf.addImage(headerImgData, 'PNG', margin, margin, contentWidth, headerImgHeight);

            const sectionCanvas = await html2canvas(sectionEl, { scale: 2 });
            const sectionImgData = sectionCanvas.toDataURL('image/png');
            const sectionImgHeight = (sectionCanvas.height * contentWidth) / sectionCanvas.width;

            // Position section below header, with a gap
            const sectionY = margin + headerImgHeight + 10;

            pdf.addImage(sectionImgData, 'PNG', margin, sectionY, contentWidth, sectionImgHeight);
        }

        pdf.save('classroom-audit-form.pdf');
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('An error occurred while generating the PDF. Please try using the Print button instead.');
    }
  }

  async downloadClassworkFormAsPDF() {
    const { jsPDF } = jspdf;
    const formElement = document.getElementById('printable-classwork-form');
    if (!formElement) {
        console.error('Printable classwork form element not found.');
        alert('Could not find form element to generate PDF.');
        return;
    }

    try {
        const canvas = await html2canvas(formElement, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const contentWidth = pdfWidth - margin * 2;
        const imgCanvasHeight = (canvas.height * contentWidth) / canvas.width;
        let imgHeight = imgCanvasHeight;

        // If the content is taller than a page, scale it down to fit.
        if (imgHeight > (pdfHeight - margin * 2)) {
          imgHeight = pdfHeight - margin * 2;
        }

        const positionY = (pdfHeight - imgHeight) / 2; // Center vertically

        pdf.addImage(imgData, 'PNG', margin, positionY, contentWidth, imgHeight);
        pdf.save('classwork-audit-form.pdf');
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('An error occurred while generating the PDF. Please try using the Print button instead.');
    }
  }

  setDashboardTimeFilter(filter: 'week' | 'month' | 'quarter' | 'half' | 'year') {
    this.dashboardTimeFilter.set(filter);
    this.clearDashboardAnalyses();
  }

  setDashboardDepartmentFilter(filter: 'All' | Department) {
    this.dashboardDepartmentFilter.set(filter);
    this.clearDashboardAnalyses();
  }

  private clearDashboardAnalyses() {
    this.aiStrengthAnalysis.set('');
    this.topPerformerPraise.set('');
    this.selectedTeacherForAnalysis.set(null);
    this.teacherAnalysisReport.set('');
  }

  async generateStrengthAnalysis() {
    this.isGeneratingAnalysis.set(true);
    this.aiStrengthAnalysis.set('');
    
    const period = this.timeFilters.find(f => f.key === this.dashboardTimeFilter())?.label || 'the selected period';
    const audits = this.filteredAuditsForDashboard();

    try {
      const result = await this.geminiService.analyzeTeacherStrengths(period, audits);
      this.aiStrengthAnalysis.set(result.replace(/\n/g, '<br>'));
    } catch (error) {
      this.aiStrengthAnalysis.set('An error occurred while generating the analysis. Please check the console.');
    } finally {
      this.isGeneratingAnalysis.set(false);
    }
  }

  async generateIndividualTeacherAnalysis(teacher: TeacherRanking) {
    this.selectedTeacherForAnalysis.set(teacher);
    this.isGeneratingTeacherAnalysis.set(true);
    this.teacherAnalysisReport.set('');

    const period = this.timeFilters.find(f => f.key === this.dashboardTimeFilter())?.label || 'the selected period';
    const allTeacherAudits = this.filteredAuditsForDashboard().filter(a => a.teacherId === teacher.teacherId);
    
    try {
      const result = await this.geminiService.analyzeIndividualTeacherStrengths(teacher.teacherName, period, allTeacherAudits);
      this.teacherAnalysisReport.set(result.replace(/\n/g, '<br>'));
    } catch (error) {
      this.teacherAnalysisReport.set('An error occurred while generating the analysis. Please check the console.');
    } finally {
      this.isGeneratingTeacherAnalysis.set(false);
    }
  }

  closeTeacherAnalysisModal() {
    this.selectedTeacherForAnalysis.set(null);
    this.teacherAnalysisReport.set('');
  }

  async generateTopPerformerPraise() {
    const topTeacher = this.dashboardData().topTeachers[0];
    if (!topTeacher) return;

    this.isGeneratingPraise.set(true);
    this.topPerformerPraise.set('');

    const period = this.timeFilters.find(f => f.key === this.dashboardTimeFilter())?.label || 'the selected period';

    try {
      const result = await this.geminiService.generatePraiseForTopTeacher(topTeacher.teacherName, period, topTeacher.averageScore, topTeacher.auditCount);
      this.topPerformerPraise.set(result.replace(/\n/g, '<br>'));
    } catch (error) {
      this.topPerformerPraise.set('An error occurred while generating the praise message.');
    } finally {
      this.isGeneratingPraise.set(false);
    }
  }
}