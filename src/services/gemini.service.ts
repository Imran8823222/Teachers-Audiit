
import { Injectable, signal } from '@angular/core';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { ClassroomAudit, ClassworkAudit, Audit } from '../models';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    // Use Angular environment for API key
    if (environment.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: environment.GEMINI_API_KEY });
    } else {
      console.error('GEMINI_API_KEY not found in environment.');
    }
  }

  async summarizeClassroomAudit(audit: ClassroomAudit, teacherName: string): Promise<string> {
    if (!this.ai) return "AI service is not configured. Please check API Key.";

    const prompt = `
      You are an experienced academic supervisor providing constructive feedback.
      Based on the following classroom audit for ${teacherName}, generate a concise, professional, and encouraging summary to be shared with them.
      Start with a salutation, e.g., "Dear ${teacherName},".
      The audit covers four key areas, each rated on a scale of 1 (Poor) to 5 (Excellent).
      For each area, synthesize the rating and the specific comments ('Continue', 'Stop', 'Start') into actionable feedback.
      Structure the summary logically, starting with overall strengths based on high ratings and positive comments, then addressing areas for development from lower ratings and 'Stop'/'Start' comments.
      End the summary with a professional closing and signature: "Sincerely, The Team at Fairy's Flower School".
      The tone should be supportive, aiming to empower the teacher. Keep the summary under 300 words.

      Audit Details:

      1. Teaching Effectiveness (Methods & Techniques)
         - Rating: ${audit.teachingEffectiveness.rating}/5
         - Strengths to Continue: ${audit.teachingEffectiveness.feedback.continue || 'N/A'}
         - Areas to Stop: ${audit.teachingEffectiveness.feedback.stop || 'N/A'}
         - Strategies to Start: ${audit.teachingEffectiveness.feedback.start || 'N/A'}

      2. Class Control & Management
         - Rating: ${audit.classControl.rating}/5
         - Strengths to Continue: ${audit.classControl.feedback.continue || 'N/A'}
         - Areas to Stop: ${audit.classControl.feedback.stop || 'N/A'}
         - Strategies to Start: ${audit.classControl.feedback.start || 'N/A'}

      3. Time & Work Management
         - Rating: ${audit.timeManagement.rating}/5
         - Strengths to Continue: ${audit.timeManagement.feedback.continue || 'N/A'}
         - Areas to Stop: ${audit.timeManagement.feedback.stop || 'N/A'}
         - Strategies to Start: ${audit.timeManagement.feedback.start || 'N/A'}

      4. Language & Professional Skills
         - Rating: ${audit.professionalSkills.rating}/5
         - Strengths to Continue: ${audit.professionalSkills.feedback.continue || 'N/A'}
         - Areas to Stop: ${audit.professionalSkills.feedback.stop || 'N/A'}
         - Strategies to Start: ${audit.professionalSkills.feedback.start || 'N/A'}
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      console.error('Error generating classroom audit summary:', error);
      return 'Error generating summary. Please check the console for details.';
    }
  }

  async summarizeClassworkAudit(audit: ClassworkAudit, teacherName: string): Promise<string> {
    if (!this.ai) return "AI service is not configured. Please check API Key.";

    const prompt = `
      You are an experienced academic auditor summarizing findings from a detailed classwork review for ${teacherName}.
      The audit was conducted on a sample of student work. Your summary should be professional, constructive, and aimed at supporting the teacher's development.
      Start with a salutation, e.g., "Dear ${teacherName},".
      Synthesize the following structured observations into a coherent narrative. First, state the context of the audit (class, student, subject). Then, discuss the findings from the error analysis, highlighting both strengths (low error counts) and areas needing attention (high error counts). Incorporate the qualitative comments and student feedback to provide specific, actionable advice.
      End the summary with a professional closing and signature: "Sincerely, The Team at Fairy's Flower School".
      Keep the summary concise and under 300 words.

      Audit Context:
      - Class: ${audit.class}
      - Student Sample: ${audit.studentName}
      - Subject: ${audit.subject}
      - Lesson/Topic: ${audit.lessonName}
      - Page Number Reference: ${audit.pageNumber}

      Auditor's Quantitative Analysis (Error Counts):
      - Spelling Errors: ${audit.spellingErrors}
      - Grammatical Errors: ${audit.grammaticalErrors}
      - Correction Errors (by teacher): ${audit.correctionErrors}
      - Outstanding/Incomplete Topics: ${audit.outstandingTopics}

      Auditor's Qualitative Observations:
      - General Comments: ${audit.comments}
      - Student Feedback Highlights: ${audit.studentFeedback}
      
      ${audit.targetDate ? `- A follow-up is scheduled for: ${audit.targetDate}` : ''}
      ${audit.followUpComments ? `- Follow-up Comments: ${audit.followUpComments}` : ''}
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      console.error('Error generating classwork audit summary:', error);
      return 'Error generating summary. Please check the console for details.';
    }
  }

  async analyzeTeacherStrengths(period: string, audits: (Audit & { teacherName: string })[]): Promise<string> {
    if (!this.ai) return "AI service is not configured. Please check API Key.";

    // Simplify data to reduce tokens and focus the model
    const simplifiedAudits = audits.map(audit => {
      if (audit.type === 'Classroom') {
        return {
          type: 'Classroom',
          strengths: {
            teaching: audit.teachingEffectiveness.rating > 3 ? audit.teachingEffectiveness.feedback.continue : undefined,
            control: audit.classControl.rating > 3 ? audit.classControl.feedback.continue : undefined,
            time: audit.timeManagement.rating > 3 ? audit.timeManagement.feedback.continue : undefined,
            skills: audit.professionalSkills.rating > 3 ? audit.professionalSkills.feedback.continue : undefined
          }
        };
      } else { // Classwork
        return {
          type: 'Classwork',
          lowErrors: {
            spelling: audit.spellingErrors === '0-2' || audit.spellingErrors === '3-4',
            grammar: audit.grammaticalErrors === '0-2' || audit.grammaticalErrors === '3-4',
            corrections: audit.correctionErrors === '0-2',
          }
        };
      }
    });

    const prompt = `
      You are an academic leadership consultant analyzing a set of teacher audits for a school administrator.
      The following JSON data represents all audits conducted for "${period}".
      Your task is to generate a concise report (under 250 words) summarizing the key *collective strengths* demonstrated by the teaching staff as a whole.

      Analysis Instructions:
      1. Review the provided data, which contains simplified information from 'Classroom' and 'Classwork' audits.
      2. For 'Classroom' audits, the 'strengths' object contains positive feedback from high-scoring categories.
      3. For 'Classwork' audits, 'lowErrors' being true indicates high performance in that area.
      4. Identify 2-3 recurring positive themes or patterns across all audits. Examples might be "strong classroom management," "effective use of teaching aids," "high accuracy in student work," or "thorough and timely corrections."
      5. Synthesize these themes into a professional, narrative summary.
      6. **Crucially, do not mention any individual teacher names.** The report must focus on group-level trends and overall team strengths.
      7. Begin the report with a heading like "Key Strengths for ${period}".

      Here is the audit data:
      ${JSON.stringify(simplifiedAudits, null, 2)}
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      console.error('Error generating strength analysis:', error);
      return 'Error generating analysis. Please try again or check the console for details.';
    }
  }

  async analyzeIndividualTeacherStrengths(teacherName: string, period: string, audits: Audit[]): Promise<string> {
    if (!this.ai) return "AI service is not configured. Please check API Key.";

    const simplifiedAudits = audits.map(audit => {
      if (audit.type === 'Classroom') {
        return {
          type: 'Classroom',
          scores: {
            teaching: audit.teachingEffectiveness.rating,
            control: audit.classControl.rating,
            time: audit.timeManagement.rating,
            skills: audit.professionalSkills.rating
          },
          feedback: audit.teachingEffectiveness.feedback.continue || audit.classControl.feedback.continue || audit.timeManagement.feedback.continue || audit.professionalSkills.feedback.continue
        };
      } else { // Classwork
        return {
          type: 'Classwork',
          lowErrors: {
            spelling: audit.spellingErrors === '0-2',
            grammar: audit.grammaticalErrors === '0-2',
            corrections: audit.correctionErrors === '0-2',
          },
          comments: audit.comments
        };
      }
    });

    const prompt = `
      You are an academic principal drafting a performance summary for an internal review.
      The following data represents all audits conducted for teacher **${teacherName}** during the period: **"${period}"**.
      
      Your task is to generate a concise, professional report (under 250 words) that identifies and elaborates on this specific teacher's key strengths, based on patterns in the provided data.

      Analysis Instructions:
      1. Analyze the audit data for ${teacherName}.
      2. Identify 2-3 consistent strengths. Look for high ratings (4 or 5) in 'Classroom' audits or consistent 'lowErrors' in 'Classwork' audits. Use the provided feedback and comments to add substance.
      3. For each identified strength, provide a brief, concrete example from the data.
      4. Synthesize these points into a professional, narrative summary.
      5. The tone should be objective and encouraging.
      6. Begin the report with a clear heading: "Key Strengths Report for ${teacherName} (${period})".

      Audit Data for ${teacherName}:
      ${JSON.stringify(simplifiedAudits, null, 2)}
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      console.error('Error generating individual strength analysis:', error);
      return 'Error generating analysis. Please try again or check the console for details.';
    }
  }

  async generatePraiseForTopTeacher(teacherName: string, period: string, averageScore: number, auditCount: number): Promise<string> {
    if (!this.ai) return "AI service is not configured. Please check API Key.";

    const prompt = `
      You are a school principal drafting a celebratory message for a top-performing teacher.
      
      Teacher: **${teacherName}**
      Achievement: Top Performer for **${period}**
      Performance Data: 
      - Average Score: **${averageScore.toFixed(1)} / 5.0**
      - Based on **${auditCount}** audits.

      Task:
      Write a warm, professional, and inspiring celebratory message (around 100-150 words).
      
      Instructions:
      1. Start by congratulating ${teacherName} on their outstanding achievement.
      2. Mention the specific period (${period}).
      3. Acknowledge their dedication and hard work, reflected by their excellent average score of ${averageScore.toFixed(1)} across ${auditCount} audits.
      4. Highlight that this consistency demonstrates a commitment to excellence and positively impacts our students.
      5. End with a heartfelt thank you and expression of pride from the school leadership.
      6. The tone should be suitable for a public announcement (e.g., staff newsletter, team meeting).
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      console.error('Error generating praise message:', error);
      return 'Error generating message. Please try again.';
    }
  }
}
