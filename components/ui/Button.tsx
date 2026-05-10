'use client'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  loading?: boolean
}

export function Button({ variant = 'primary', loading, children, disabled, className = '', ...props }: ButtonProps) {
  const base = 'px-6 py-3 rounded-xl font-bold text-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-green-500 text-white hover:bg-green-400',
    secondary: 'bg-gray-700 text-white hover:bg-gray-600',
    danger: 'bg-red-600 text-white hover:bg-red-500',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? '...' : children}
    </button>
  )
}
