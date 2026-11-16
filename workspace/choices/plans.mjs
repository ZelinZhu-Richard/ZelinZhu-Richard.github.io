import { ALTERNATIVES } from './data/alternatives.mjs';
import { UNC } from './data/unc.mjs';
import { DUKE } from './data/duke.mjs';
import { STANFORD } from './data/stanford.mjs';
import { FIELDS } from './data/fields.mjs';
import { TRANSFER } from './data/transfer.mjs';

// User-requested possibilities and researched public opportunities only.
// This is an overview; the linked sections hold course sequences and eligibility.
const schools = [UNC, DUKE, STANFORD];
export const CHOICES = {
  id: 'here', title: 'The next chapter', status: 'Starting point',
  description: 'Build skills, make things, and keep several strong routes open.',
  children: [
    {
      id: 'senior-spring', title: 'Senior spring', status: 'Before graduation', collapsed: true,
      description: 'Build proof of work. Try a job, a lab, or a founder program.',
      children: [
        { id: 'job', title: 'Work on a real problem', description: 'A part-time job, paid technical project, or open-source contribution can reveal what work I enjoy.', nextStep: 'Finish one useful artifact and use it to approach a small team.', href: '#career-lanes', linkLabel: 'Compare the career lanes' },
        { id: 'research', title: 'Find a research question', description: 'Explore a mentor-led project at UNC, Duke, or an eligible summer program.', nextStep: 'Read a lab’s work and prepare a small reproducible result before asking about a role.', href: '#internships', linkLabel: 'Research & internship leads' },
        { id: 'build', title: 'Test an idea now', description: 'Z Fellows, Medici, and Emergent Ventures can support an early project without assuming a full college exit.', nextStep: 'Choose one problem and a four-week deliverable.', href: '#alternatives', linkLabel: 'Compare programs' },
      ],
    },
    {
      id: 'after-high-school', title: 'After high school', status: 'Choose a setting', collapsed: true,
      description: 'College, a structured fellowship, or a deliberate year of building.',
      children: [
        {
          id: 'college', title: 'Build from a university', description: 'Choose the environment, then the degree and workload.', collapsed: true,
          children: schools.map(school => ({
            id: `college-${school.id}`, title: school.name, description: school.summary, collapsed: true,
            href: `#school-${school.id}`, linkLabel: 'Courses & campus opportunities',
            children: [
              ...school.routes.map(route => ({ id: `${school.id}-${route.id}`, title: `${({stretch:'Stretch',ambitious:'Ambitious',balanced:'Balanced'})[route.id]} route`, status: route.load, description: route.degree, href: `#route-${school.id}-${route.id}`, linkLabel: 'Open the course sequence' })),
              ...(school.focusTracks || []).map(track => ({ id: `${school.id}-focus-${track.id}`, title: track.name, status: 'Courses + activities', description: track.aim, href: `#focus-${school.id}-${track.id}`, linkLabel: 'Build this focus year by year' })),
            ],
          })),
        },
        {
          id: 'fellowships', title: 'A different launch point', description: 'Compare full-time alternatives with shorter programs and project funding.', collapsed: true,
          children: ALTERNATIVES.map(item => ({ id: `fellowship-${item.id}`, title: item.name, status: item.kind, description: item.duration, href: `#opportunity-${item.id}`, linkLabel: 'Commitment, eligibility & status' })),
        },
        {
          id: 'transfer', title: 'UNC → Stanford?', description: 'Compare six academic directions, including ML, operations research and econometrics together, the application year, and the value of staying at UNC.', collapsed: true,
          href: '#transfer-plans', linkLabel: 'Build a concrete transfer path',
          children: [
            { id: 'transfer-directions', title: 'Choose an academic direction', description: 'MS&E and CS are the first target; compare the questions that fit Symbolic Systems, Data Science, or STS.', collapsed: true,
              children: TRANSFER.paths.map(path => ({id:`transfer-direction-${path.id}`,title:path.name,description:path.question,href:`#transfer-path-${path.id}`,linkLabel:'Courses, activities & evidence'})) },
            { id: 'transfer-timing', title: 'Choose the application year', description: 'Decide from the strength of the college work and the reason to transfer.', collapsed: true,
              children: TRANSFER.timings.map(item => ({id:`transfer-window-${item.id}`,title:item.name,description:item.timing,href:`#transfer-timing-${item.id}`,linkLabel:'Preparation & decision checkpoint'})) },
            { id: 'transfer-stay', title: 'Stay and go deeper', description: 'Keep the UNC research, course, and internship plan strong. A transfer is an option, not the definition of success.', href: '#school-unc', linkLabel: 'UNC course routes' },
          ],
        },
      ],
    },
    {
      id: 'direction', title: 'What to become good at', status: 'Choose the work', collapsed: true,
      description: 'Math, data, marketing, dependable AI, research, or building a company.',
      children: [
        { id: 'fields', title: 'Choose a field', description: 'Pick a question and its prerequisite chain before stacking credentials.', collapsed: true,
          children: FIELDS.map(field => ({id:`study-${field.id}`,title:field.name,description:field.question,href:`#field-${field.id}`,linkLabel:'Courses, pairings & proof of work'})) },
        { id: 'careers', title: 'Test a career direction', description: 'Compare quant, research, AI safety and evaluation, marketing, software, economics, and entrepreneurship.', href: '#career-lanes', linkLabel: 'Course-to-career map' },
        { id: 'experience', title: 'Get outside experience', description: 'Use stage-appropriate exploration programs, research, internships, and real projects to test the choice.', href: '#internships', linkLabel: 'Find the next eligible opportunity' },
      ],
    },
  ],
};

export const CONTENT_NOTE = 'Possibilities, not admissions or offers. Course plans are proposals with placement and prerequisite assumptions. Sources checked November 10, 2026.';
