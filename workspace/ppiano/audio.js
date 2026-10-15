import { frequency, clamp } from './music.js';
export class InstrumentAudio {
  constructor() { this.voices=new Map();this.buffers=new Map();this.bank='retro';this.volume=.55;this.sustain=false;this.generation=0; }
  async unlock() {
    if(!this.context){
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)throw new Error('Web Audio is unavailable. Try a current browser.');
      this.context=new Audio({latencyHint:'interactive'});
      this.filter=this.context.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=5000;
      this.master=this.context.createGain();this.master.gain.value=this.volume*.3;
      this.limiter=this.context.createDynamicsCompressor();this.limiter.threshold.value=-12;this.limiter.knee.value=12;this.limiter.ratio.value=8;
      this.analyser=this.context.createAnalyser();this.analyser.fftSize=256;
      this.filter.connect(this.master).connect(this.limiter).connect(this.analyser).connect(this.context.destination);
    }
    await this.context.resume();
  }
  async setBank(bank) {
    if(bank===this.bank&&(['warm','bright','retro'].includes(bank)||this.buffers.has(bank)))return true;
    const generation=++this.generation;this.allOff();this.bank=bank;
    if(['warm','bright','retro'].includes(bank))return;
    if(!this.catalog){const r=await fetch('/ppiano/assets/samples.json');if(!r.ok)throw new Error('Instrument catalog could not load.');this.catalog=await r.json();}
    if(!this.catalog[bank])throw new Error('Unknown instrument.');
    if(!this.buffers.has(bank)){
      const samples=await Promise.all(this.catalog[bank].map(async sample=>{
        const r=await fetch(sample.url);if(!r.ok)throw new Error('Sound download failed. Retry or choose a synth sound.');
        return {...sample,buffer:await this.context.decodeAudioData(await r.arrayBuffer())};
      }));this.buffers.set(bank,samples);
    }
    return generation===this.generation;
  }
  noteOn(id,midi,velocity=.75) {
    if(!this.context||this.context.state!=='running')return false;
    if(this.voices.has(id))this.release(id,true);
    let node;
    if(['warm','bright','retro'].includes(this.bank)){
      node=this.context.createOscillator();node.type={warm:'triangle',bright:'sawtooth',retro:'square'}[this.bank];node.frequency.value=frequency(midi);
    }else{
      const samples=this.buffers.get(this.bank);if(!samples)return false;
      const sample=samples.reduce((a,b)=>Math.abs(b.midi-midi)<Math.abs(a.midi-midi)?b:a);
      node=this.context.createBufferSource();node.buffer=sample.buffer;node.playbackRate.value=2**((midi-sample.midi)/12);
    }
    const gain=this.context.createGain(),now=this.context.currentTime;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(clamp(velocity)*.5,now+.012);
    node.connect(gain).connect(this.filter);node.start();
    const voice={node,gain,midi,held:true};this.voices.set(id,voice);
    node.onended=()=>{node.disconnect();gain.disconnect();if(this.voices.get(id)===voice)this.voices.delete(id);};
    return true;
  }
  release(id,force=false) {
    const v=this.voices.get(id);if(!v)return;
    v.held=false;if(this.sustain&&!force)return;
    this.voices.delete(id);const now=this.context.currentTime;
    v.gain.gain.cancelScheduledValues(now);v.gain.gain.setTargetAtTime(0,now,.025);try{v.node.stop(now+.15);}catch{}
  }
  setSustain(on){this.sustain=on;if(!on)for(const[id,v]of this.voices)if(!v.held)this.release(id,true);}
  allOff(){for(const id of this.voices.keys())this.release(id,true);}
  expression(volume,filter=1){if(!this.context)return;const t=this.context.currentTime;this.master.gain.setTargetAtTime(this.volume*clamp(volume)*.35,t,.025);this.filter.frequency.setTargetAtTime(filter<0?1200+filter*950:1200+filter*3800,t,.04);}
  setChord(notes){
    const wanted=new Set(notes.map(n=>`gesture:${n}`));
    for(const id of this.voices.keys())if(id.startsWith('gesture:')&&!wanted.has(id))this.release(id,true);
    for(const n of notes)if(!this.voices.has(`gesture:${n}`))this.noteOn(`gesture:${n}`,n,.7);
  }
}
