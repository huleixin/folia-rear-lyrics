import React from 'react';
import SleepTimerSheet from '../../src/components/modal/SleepTimerSheet';
import type {ProbeDefinition} from './definition';
// dev/probes/sleepTimer.probe.tsx
const Component=()=> <div style={{'--text-primary':'#eef6ef','--text-secondary':'#b3c9bd'} as React.CSSProperties}><SleepTimerSheet/></div>;
export default {id:'sleepTimer',title:'定时关闭',description:'移动端睡眠定时底部弹层',Component} satisfies ProbeDefinition;
