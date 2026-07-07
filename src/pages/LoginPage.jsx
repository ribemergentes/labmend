import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react'

export default function LoginPage() {
  const login = useAppStore(s => s.login)
  const [form,    setForm]   = useState({ email:'', password:'' })
  const [showPw,  setShowPw] = useState(false)
  const [loading, setLoading]= useState(false)
  const [error,   setError]  = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await login(form.email, form.password) }
    catch(err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:'linear-gradient(135deg,#010913 0%,#040f20 30%,#071b38 65%,#050e1f 100%)',
      }}
    >
      {/* Partículas decorativas */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {[
          {w:280,h:280,t:5,  l:2,  d:8 },
          {w:180,h:180,t:65, l:75, d:6 },
          {w:220,h:220,t:30, l:45, d:9 },
          {w:300,h:300,t:72, l:15, d:7 },
          {w:140,h:140,t:12, l:60, d:10},
          {w:100,h:100,t:50, l:88, d:5 },
        ].map((b,i)=>(
          <div key={i} className="absolute rounded-full"
            style={{
              width:b.w,height:b.h,top:`${b.t}%`,left:`${b.l}%`,
              background:'radial-gradient(circle,rgba(59,130,246,0.06) 0%,transparent 70%)',
              animation:`bgPulse ${b.d}s ease-in-out infinite`,
              animationDelay:`${i*0.7}s`,
            }}/>
        ))}
      </div>

      {/* ── Ventana principal ── */}
      <div
        className="relative z-10 flex w-full overflow-hidden"
        style={{
          maxWidth:'860px',
          borderRadius:'24px',
          border:'1px solid rgba(255,255,255,0.08)',
          boxShadow:'0 50px 120px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >

        {/* ══════════════════════════════════
            PANEL IZQUIERDO — Formulario
        ══════════════════════════════════ */}
        <div
          className="flex flex-col justify-center w-full p-10"
          style={{
            flex:'1 1 0',
            background:'linear-gradient(160deg,rgba(255,255,255,0.055) 0%,rgba(255,255,255,0.015) 100%)',
            backdropFilter:'blur(24px)',
            borderRight:'1px solid rgba(255,255,255,0.06)',
          }}
        >
          {/* Cabecera */}
          <div className="flex items-center gap-2 mb-8 pb-4"
               style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-1 h-4 rounded-full" style={{ background:'linear-gradient(180deg,#60a5fa,#2563eb)' }}/>
            <span className="text-[10px] font-bold text-blue-300/60 uppercase tracking-[0.2em]">Iniciar Sesión</span>
          </div>

          {/* Título */}
          <div className="flex flex-col items-center mb-8">
            <h2 className="text-2xl font-black text-white tracking-tight">Bienvenido</h2>
            <p className="text-blue-300/45 text-[11px] mt-1 tracking-wide">Sistema de Laboratorio Clínico</p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-2"
                     style={{ color:'rgba(147,197,253,0.55)' }}>
                Correo electrónico
              </label>
              <input type="email" required
                placeholder="usuario@laboratorio.com"
                value={form.email}
                onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                style={{
                  width:'100%',padding:'11px 15px',borderRadius:'13px',fontSize:'13px',
                  background:'rgba(255,255,255,0.065)',border:'1px solid rgba(255,255,255,0.1)',
                  color:'#fff',outline:'none',transition:'border-color .2s, background .2s',
                }}
                onFocus={e=>{e.target.style.borderColor='rgba(59,130,246,0.7)';e.target.style.background='rgba(255,255,255,0.09)'}}
                onBlur={e =>{e.target.style.borderColor='rgba(255,255,255,0.1)';e.target.style.background='rgba(255,255,255,0.065)'}}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-2"
                     style={{ color:'rgba(147,197,253,0.55)' }}>
                Contraseña
              </label>
              <div className="relative">
                <input type={showPw?'text':'password'} required
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e=>setForm(f=>({...f,password:e.target.value}))}
                  style={{
                    width:'100%',padding:'11px 40px 11px 15px',borderRadius:'13px',fontSize:'13px',
                    background:'rgba(255,255,255,0.065)',border:'1px solid rgba(255,255,255,0.1)',
                    color:'#fff',outline:'none',transition:'border-color .2s, background .2s',
                  }}
                  onFocus={e=>{e.target.style.borderColor='rgba(59,130,246,0.7)';e.target.style.background='rgba(255,255,255,0.09)'}}
                  onBlur={e =>{e.target.style.borderColor='rgba(255,255,255,0.1)';e.target.style.background='rgba(255,255,255,0.065)'}}
                />
                <button type="button" onClick={()=>setShowPw(v=>!v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color:'rgba(255,255,255,0.3)' }}>
                  {showPw?<EyeOff size={15}/>:<Eye size={15}/>}
                </button>
              </div>
            </div>

            {error && (
              <div className="px-4 py-2.5 rounded-xl text-xs"
                   style={{
                     background:'rgba(239,68,68,0.12)',
                     border:'1px solid rgba(239,68,68,0.22)',
                     color:'#fca5a5',
                   }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              style={{
                background:'linear-gradient(135deg,#3b82f6 0%,#1d4ed8 60%,#1e3a8a 100%)',
                boxShadow:'0 6px 24px rgba(37,99,235,0.45), inset 0 1px 0 rgba(255,255,255,0.15)',
                opacity:loading?0.7:1,
                marginTop:'8px',
              }}>
              {loading
                ?<><Loader2 size={15} className="animate-spin"/>Iniciando...</>
                :<><LogIn size={15}/>Iniciar Sesión</>}
            </button>
          </form>

          <p className="text-center text-[9px] mt-8" style={{ color:'rgba(255,255,255,0.14)' }}>
            MendLab v7 — Sistema de Laboratorio
          </p>
        </div>

        {/* ══════════════════════════════════
            PANEL DERECHO — Imagen + Logo
        ══════════════════════════════════ */}
        <div
          className="relative hidden md:flex flex-col overflow-hidden"
          style={{ flex:'1 1 0', minHeight:'520px' }}
        >
          {/* Imagen de fondo — casi completa, overlay leve */}
          <img src={`${import.meta.env.BASE_URL}login_imagen.png`} alt="Fondo"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {/* Overlay sutil para legibilidad sin tapar la imagen */}
          <div className="absolute inset-0"
               style={{
                 background:'linear-gradient(180deg,rgba(1,9,19,0.55) 0%,rgba(4,15,32,0.35) 40%,rgba(4,15,32,0.55) 75%,rgba(1,9,19,0.80) 100%)',
               }}/>

          {/* Línea decorativa izquierda */}
          <div className="absolute left-0 top-0 h-full w-px"
               style={{ background:'linear-gradient(180deg,transparent,rgba(96,165,250,0.25) 30%,rgba(96,165,250,0.25) 70%,transparent)' }}/>

          {/* Logo + texto — muy abajo */}
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-6 z-10">

            {/* Logo 3D */}
            <div style={{ perspective:'1000px' }}>
              <img src={`${import.meta.env.BASE_URL}logo_3d.png`} alt="Logo MendLab"
                className="object-contain"
                style={{
                  width:'290px', height:'290px',
                  animation:'flip90 7s ease-in-out infinite',
                  filter:'drop-shadow(0 10px 36px rgba(59,130,246,0.4))',
                  marginBottom:'-18px',
                }}
              />
            </div>

            {/* Texto 3D */}
            <div className="text-center" style={{ marginTop:'-30px' }}>
              {/* Línea decorativa */}
              <div className="flex items-center gap-3 justify-center mb-2">
                <div className="h-px w-8" style={{ background:'linear-gradient(90deg,transparent,rgba(147,197,253,0.4))' }}/>
                <div className="w-1 h-1 rounded-full bg-blue-400/50"/>
                <div className="h-px w-8" style={{ background:'linear-gradient(90deg,rgba(147,197,253,0.4),transparent)' }}/>
              </div>

              <p
                className="font-black uppercase"
                style={{
                  fontSize:'15px',
                  letterSpacing:'0.22em',
                  color:'#ffffff',
                  textShadow:`
                    0 1px 0 #cce0ff,
                    0 2px 0 #90baff,
                    0 3px 0 #5585d4,
                    0 4px 6px rgba(0,0,0,0.6)
                  `,
                }}
              >
                LABORATORIO DE
              </p>
              <p
                className="font-black uppercase mt-0.5"
                style={{
                  fontSize:'17px',
                  letterSpacing:'0.16em',
                  color:'#ffffff',
                  textShadow:`
                    0 1px 0 #daeaff,
                    0 2px 0 #a8ccff,
                    0 3px 0 #6fa4f0,
                    0 4px 0 #3a6abc,
                    0 5px 8px rgba(0,0,0,0.7)
                  `,
                }}
              >
                ANÁLISIS CLÍNICO
              </p>

              {/* Línea decorativa inferior */}
              <div className="flex items-center gap-2 justify-center mt-2">
                <div className="h-px w-5" style={{ background:'rgba(147,197,253,0.25)' }}/>
                <div className="w-1 h-1 rounded-full bg-blue-400/35"/>
                <div className="h-px w-16" style={{ background:'rgba(147,197,253,0.25)' }}/>
                <div className="w-1 h-1 rounded-full bg-blue-400/35"/>
                <div className="h-px w-5" style={{ background:'rgba(147,197,253,0.25)' }}/>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Animaciones ── */}
      <style>{`
        @keyframes flip90 {
          0%   { transform: rotateY(0deg);  animation-timing-function: ease-in;  }
          40%  { transform: rotateY(80deg); animation-timing-function: ease-out; }
          58%  { transform: rotateY(88deg); animation-timing-function: ease-out; }
          68%  { transform: rotateY(90deg); animation-timing-function: ease-in;  }
          100% { transform: rotateY(0deg);  }
        }

        @keyframes bgPulse {
          0%,100% { transform:scale(1);    opacity:.6; }
          50%      { transform:scale(1.18); opacity:1;  }
        }

        input::placeholder { color:rgba(255,255,255,0.22); }
      `}</style>
    </div>
  )
}
