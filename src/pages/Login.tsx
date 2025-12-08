import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Key, Lock, Mail, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    secret: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isRegisterMode) {
        await register(formData.email, formData.password, formData.name, formData.secret);
        toast.success('Conta criada com sucesso!');
      } else {
        await login(formData.email, formData.password);
        toast.success('Bem-vindo!');
      }
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao processar solicitação');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode);
    setFormData({ email: '', password: '', name: '', secret: '' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 safe-area-inset">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-6 md:mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 md:h-16 md:w-16 rounded-2xl overflow-hidden bg-card mb-4">
            <img src="/logo.png" alt="DeployHub" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">DeployHub</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2">
            {isRegisterMode ? 'Crie sua conta' : 'Acesse seu painel DevOps'}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
            {isRegisterMode && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm">Nome</Label>
                <div className="relative">
                  <UserPlus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Seu nome"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="pl-10 h-11"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@deployhub.local"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="pl-10 h-11"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="pl-10 pr-10 h-11"
                  required
                  minLength={isRegisterMode ? 6 : 1}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isRegisterMode && (
              <div className="space-y-2">
                <Label htmlFor="secret" className="text-sm">Secret de Registro</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="secret"
                    type="password"
                    placeholder="Digite o secret de autorização"
                    value={formData.secret}
                    onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                    className="pl-10 h-11"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  O secret é necessário para criar novas contas
                </p>
              </div>
            )}

            <Button type="submit" variant="gradient" className="w-full h-11 md:h-12 text-base" disabled={isLoading}>
              {isLoading
                ? (isRegisterMode ? 'Criando conta...' : 'Entrando...')
                : (isRegisterMode ? 'Criar Conta' : 'Entrar')
              }
            </Button>
          </form>

          <div className="mt-5 md:mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm text-muted-foreground hover:text-primary transition-colors py-2"
            >
              {isRegisterMode
                ? 'Já tem uma conta? Faça login'
                : 'Precisa de uma conta? Cadastre-se'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
