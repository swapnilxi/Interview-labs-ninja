import { handleAddModuleLandingSection, handleListModuleLandingSections } from 'fe-apis/lms';

export async function GET(req: Request) {
  return handleListModuleLandingSections(req);
}

export async function POST(req: Request) {
  return handleAddModuleLandingSection(req);
}
