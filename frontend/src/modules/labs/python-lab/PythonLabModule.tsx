'use client';

import TopicLab from '@/modules/labs/common/TopicLab';
import { PYTHON_LAB } from './labConfig';

export default function PythonLabModule() {
  return <TopicLab config={PYTHON_LAB} />;
}
